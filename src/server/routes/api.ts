import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  BulkActionsRequest,
  BulkActionsResponse,
  BulkModAction,
  BulkSeverity,
  Cluster,
  ClustersResponse,
  InitResponse,
  ModeratorAvatar,
  ModeratorsResponse,
  PostActionsRequest,
  PostActionsResponse,
  PostDetailsResponse,
} from '../../shared/api';
import { hydrateState, persistState, readClusters } from '../redis/redisStore';
import { T3 } from '@devvit/shared-types/tid.js';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();
const avatarCache = new Map<string, string | undefined>();
const TEMP_BAN_DAYS = 3;
const ESCALATION_SUBJECT = 'ModPit escalation';

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const username = await reddit.getCurrentUsername();
    return c.json<InitResponse>({
      type: 'init',
      postId,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

// Dashboard polls this every few seconds. Pure read — does not touch the
// engine singleton, so concurrent reads are cheap.
api.get('/clusters', async (c) => {
  try {
    const clusters = await enrichClusterAvatars(await readClusters());
    return c.json<ClustersResponse>({ type: 'clusters', clusters });
  } catch (error) {
    console.error('Failed to read clusters:', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to read clusters' },
      500
    );
  }
});

api.get('/moderators', async (c) => {
  try {
    const subreddit = await reddit.getCurrentSubreddit();
    const moderators = await subreddit.getModerators({ limit: 10 }).all();
    const enriched = await Promise.all(
      moderators.map(async (moderator): Promise<ModeratorAvatar> => {
        const avatarUrl = await getAvatarUrlForUser(
          moderator.username,
          moderator.getSnoovatarUrl.bind(moderator)
        );
        return {
          username: moderator.username,
          avatarUrl,
        };
      })
    );

    return c.json<ModeratorsResponse>({
      type: 'moderators',
      moderators: enriched,
    });
  } catch (error) {
    console.error('Failed to read moderators:', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to read moderators' },
      500
    );
  }
});

api.post('/clusters/:clusterId/bulk-actions', async (c) => {
  const clusterId = c.req.param('clusterId');
  const payload = await c.req.json<BulkActionsRequest>();

  if (!isValidSeverity(payload.severity)) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Invalid severity' },
      400
    );
  }

  const selectedActions = dedupeActions(payload.actions);
  if (selectedActions.length === 0) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'At least one action is required' },
      400
    );
  }

  const { clusters } = await hydrateState();
  const cluster = clusters.find((candidate) => candidate.id === clusterId);
  if (!cluster) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Cluster not found' },
      404
    );
  }

  const posts = cluster.items.filter((item) => item.severity === payload.severity);
  if (posts.length === 0) {
    return c.json<BulkActionsResponse>({
      type: 'bulk-actions',
      clusterId,
      severity: payload.severity,
      totalPosts: 0,
      affectedUsers: 0,
      selectedActions,
      successCount: 0,
      failureCount: 0,
      errors: [],
    });
  }

  const subreddit = await reddit.getCurrentSubreddit();
  const reasons = await subreddit.getRemovalReasons();
  const firstReason = reasons.at(0);
  const defaultReasonId = firstReason ? firstReason.id : '';
  const usernames = [...new Set(posts.map((post) => post.authorName))];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  let shouldPersistEscalation = false;

  for (const postItem of posts) {
    const postId = normalizePostId(postItem.postId);
    let post = await loadPost(postId);
    if (!post) {
      failureCount += selectedActions.length;
      errors.push(`Post ${postItem.postId}: unable to load`);
      continue;
    }

    for (const action of selectedActions) {
      try {
        await executePostAction(action, post, {
          authorName: postItem.authorName,
          reasonId: defaultReasonId,
          subredditName: subreddit.name,
        });
        successCount++;
      } catch (error) {
        failureCount++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Post ${postItem.postId} (${action}): ${message}`);
        post = post ?? await loadPost(postId);
      }
    }
  }

  if (selectedActions.includes('temporary_ban') || selectedActions.includes('permanent_ban') || selectedActions.includes('mute_user')) {
    const userActions = selectedActions.filter((action) =>
      action === 'temporary_ban' || action === 'permanent_ban' || action === 'mute_user'
    );

    for (const username of usernames) {
      for (const action of userActions) {
        try {
          await executeUserAction(action, subreddit, username);
          successCount++;
        } catch (error) {
          failureCount++;
          const message = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`User ${username} (${action}): ${message}`);
        }
      }
    }
  }

  if (selectedActions.includes('escalate')) {
    if (context.subredditId) {
      try {
        await reddit.modMail.createModNotification({
          subject: ESCALATION_SUBJECT,
          bodyMarkdown: buildEscalationMessage(cluster.label, payload.severity, posts.length),
          subredditId: context.subredditId,
        });
        successCount++;
      } catch (error) {
        failureCount++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Escalation notification: ${message}`);
      }
    } else {
      failureCount++;
      errors.push('Escalation notification: subreddit context is unavailable');
    }

    shouldPersistEscalation = true;
  }

  if (shouldPersistEscalation) {
    const nextClusters: Cluster[] = clusters.map((candidate) =>
      candidate.id === cluster.id
        ? { ...candidate, status: 'escalating' as const }
        : candidate
    );
    await persistState(nextClusters);
  }

  if (successCount > 0) {
    const selectedPostIds = posts.map((post) => post.postId);
    const nextClusters = pruneClustersByPostIds(clusters, selectedPostIds);
    await persistState(nextClusters);
  }

  return c.json<BulkActionsResponse>({
    type: 'bulk-actions',
    clusterId,
    severity: payload.severity,
    totalPosts: posts.length,
    affectedUsers: usernames.length,
    selectedActions,
    successCount,
    failureCount,
    errors,
  });
});

api.get('/posts/:postId/details', async (c) => {
  const rawPostId = c.req.param('postId');
  const postId = normalizePostId(rawPostId);
  const post = await loadPost(postId);
  if (!post) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Post not found' },
      404
    );
  }

  const clusters = await readClusters();
  const clusterItem = clusters
    .flatMap((cluster) => cluster.items)
    .find((item) => normalizePostId(item.postId) === postId);

  if (!clusterItem) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Post is not part of any active cluster' },
      404
    );
  }

  const user = await reddit.getUserByUsername(clusterItem.authorName);
  const avatarUrl = await getAvatarUrlForUsername(clusterItem.authorName);
  const userKarma = user ? user.linkKarma + user.commentKarma : clusterItem.authorKarma;
  const joinedAt = user ? user.createdAt.getTime() : Date.now() - clusterItem.authorAgeDays * 86_400_000;
  const flair = post.flair?.text?.trim();

  return c.json<PostDetailsResponse>({
    type: 'post-details',
    postId: clusterItem.postId,
    title: post.title || clusterItem.title,
    body: post.body ?? clusterItem.body,
    flair: flair || undefined,
    severity: clusterItem.severity,
    reportCount: clusterItem.reportCount,
    reportType: clusterItem.reportType,
    timestamp: clusterItem.timestamp,
    author: {
      username: clusterItem.authorName,
      avatarUrl: avatarUrl ?? buildDefaultAvatarUrl(clusterItem.authorName),
      bannerUrl: buildUserBannerUrl(clusterItem.authorName),
      accountAgeDays: clusterItem.authorAgeDays,
      karma: userKarma,
      joinedAt,
      profileUrl: `https://reddit.com/u/${clusterItem.authorName}/`,
    },
  });
});

api.post('/posts/:postId/actions', async (c) => {
  const rawPostId = c.req.param('postId');
  const payload = await c.req.json<PostActionsRequest>();
  const selectedActions = dedupeActions(payload.actions);

  if (selectedActions.length === 0) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'At least one action is required' },
      400
    );
  }

  const postId = normalizePostId(rawPostId);
  const post = await loadPost(postId);
  if (!post) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Post not found' },
      404
    );
  }

  const subreddit = await reddit.getCurrentSubreddit();
  const reasons = await subreddit.getRemovalReasons();
  const firstReason = reasons.at(0);
  const defaultReasonId = firstReason ? firstReason.id : '';
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const action of selectedActions) {
    if (isUserAction(action)) continue;
    try {
      await executePostAction(action, post, {
        authorName: post.authorName,
        reasonId: defaultReasonId,
        subredditName: subreddit.name,
      });
      successCount++;
    } catch (error) {
      failureCount++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Post action ${action}: ${message}`);
    }
  }

  for (const action of selectedActions) {
    if (!isUserAction(action)) continue;
    try {
      await executeUserAction(action, subreddit, post.authorName);
      successCount++;
    } catch (error) {
      failureCount++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`User action ${action}: ${message}`);
    }
  }

  if (selectedActions.includes('escalate')) {
    if (context.subredditId) {
      try {
        await reddit.modMail.createModNotification({
          subject: ESCALATION_SUBJECT,
          bodyMarkdown: buildSinglePostEscalation(post.title, post.id),
          subredditId: context.subredditId,
        });
        successCount++;
      } catch (error) {
        failureCount++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Escalation notification: ${message}`);
      }
    } else {
      failureCount++;
      errors.push('Escalation notification: subreddit context is unavailable');
    }
  }

  if (successCount > 0) {
    const nextClusters = pruneClustersByPostIds(await readClusters(), [rawPostId]);
    await persistState(nextClusters);
  }

  return c.json<PostActionsResponse>({
    type: 'post-actions',
    postId: rawPostId,
    selectedActions,
    successCount,
    failureCount,
    errors,
  });
});

async function enrichClusterAvatars(clusters: Cluster[]): Promise<Cluster[]> {
  return await Promise.all(
    clusters.map(async (cluster) => ({
      ...cluster,
      items: await Promise.all(
        cluster.items.map(async (item) => ({
          ...item,
          authorAvatarUrl:
            item.authorAvatarUrl ??
            await getAvatarUrlForUsername(item.authorName),
        }))
      ),
    }))
  );
}

async function getAvatarUrlForUsername(username: string): Promise<string | undefined> {
  if (avatarCache.has(username)) {
    return avatarCache.get(username);
  }

  try {
    const user = await reddit.getUserByUsername(username);
    const avatarUrl = user ? await user.getSnoovatarUrl() : undefined;
    avatarCache.set(username, avatarUrl);
    return avatarUrl;
  } catch (error) {
    console.warn(`Avatar lookup failed for ${username}:`, error);
    avatarCache.set(username, undefined);
    return undefined;
  }
}

async function getAvatarUrlForUser(
  username: string,
  loadAvatarUrl: () => Promise<string | undefined>
): Promise<string | undefined> {
  if (avatarCache.has(username)) {
    return avatarCache.get(username);
  }

  try {
    const avatarUrl = await loadAvatarUrl();
    avatarCache.set(username, avatarUrl);
    return avatarUrl;
  } catch (error) {
    console.warn(`Avatar lookup failed for ${username}:`, error);
    avatarCache.set(username, undefined);
    return undefined;
  }
}

function isValidSeverity(severity: string): severity is BulkSeverity {
  return severity === 'critical' || severity === 'high' || severity === 'low';
}

function isValidAction(action: string): action is BulkModAction {
  return (
    action === 'approve' ||
    action === 'remove' ||
    action === 'mark_spam' ||
    action === 'lock_comments' ||
    action === 'add_user_note' ||
    action === 'send_removal_reason' ||
    action === 'temporary_ban' ||
    action === 'permanent_ban' ||
    action === 'mute_user' ||
    action === 'escalate' ||
    action === 'ignore_reports'
  );
}

function dedupeActions(actions: string[]): BulkModAction[] {
  const normalized: BulkModAction[] = [];
  for (const action of actions) {
    if (isValidAction(action) && !normalized.includes(action)) {
      normalized.push(action);
    }
  }
  return normalized;
}

function isUserAction(action: BulkModAction): boolean {
  return action === 'temporary_ban' || action === 'permanent_ban' || action === 'mute_user';
}

function normalizePostId(postId: string): ReturnType<typeof T3> {
  const value = postId.startsWith('t3_') ? postId : `t3_${postId}`;
  return T3(value);
}

async function loadPost(postId: ReturnType<typeof T3>): Promise<Awaited<ReturnType<typeof reddit.getPostById>> | null> {
  try {
    return await reddit.getPostById(postId);
  } catch (error) {
    console.warn(`Failed to load post ${postId}:`, error);
    return null;
  }
}

async function executePostAction(
  action: BulkModAction,
  post: Awaited<ReturnType<typeof reddit.getPostById>>,
  options: {
    authorName: string;
    reasonId: string;
    subredditName: string;
  }
): Promise<void> {
  if (action === 'approve') {
    await post.approve();
    return;
  }
  if (action === 'remove') {
    await post.remove(false);
    return;
  }
  if (action === 'mark_spam') {
    await post.remove(true);
    return;
  }
  if (action === 'lock_comments') {
    await post.lock();
    return;
  }
  if (action === 'add_user_note') {
    await reddit.addModNote({
      subreddit: options.subredditName,
      user: options.authorName,
      redditId: post.id,
      note: 'Bulk action note from ModPit',
    });
    return;
  }
  if (action === 'send_removal_reason') {
    await post.addRemovalNote({
      reasonId: options.reasonId,
      modNote: 'Bulk action from ModPit',
    });
    return;
  }
  if (action === 'ignore_reports') {
    await post.ignoreReports();
  }
}

async function executeUserAction(
  action: BulkModAction,
  subreddit: Awaited<ReturnType<typeof reddit.getCurrentSubreddit>>,
  username: string
): Promise<void> {
  if (action === 'temporary_ban') {
    await subreddit.banUser({
      username,
      duration: TEMP_BAN_DAYS,
      reason: 'Temporary ban via ModPit bulk action',
      note: 'Temporary ban via ModPit bulk action',
    });
    return;
  }
  if (action === 'permanent_ban') {
    await subreddit.banUser({
      username,
      reason: 'Permanent ban via ModPit bulk action',
      note: 'Permanent ban via ModPit bulk action',
    });
    return;
  }
  if (action === 'mute_user') {
    await subreddit.muteUser(username, 'Muted via ModPit bulk action');
  }
}

function buildEscalationMessage(
  clusterLabel: string,
  severity: BulkSeverity,
  postCount: number
): string {
  return [
    `Escalation requested from ModPit.`,
    `Cluster: ${clusterLabel}`,
    `Severity split: ${severity}`,
    `Posts affected: ${postCount}`,
  ].join('\n');
}

function buildSinglePostEscalation(postTitle: string, postId: string): string {
  return [
    `Single post escalation requested from ModPit.`,
    `Post: ${postTitle}`,
    `Post ID: ${postId}`,
  ].join('\n');
}

function buildUserBannerUrl(username: string): string {
  const seed = encodeURIComponent(username);
  return `https://api.dicebear.com/9.x/shapes/png?seed=${seed}&backgroundType=gradientLinear&backgroundColor=f97316,f43f5e,0ea5e9`;
}

function buildDefaultAvatarUrl(username: string): string {
  const defaultId = username
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8;
  return `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${defaultId}.png`;
}

function pruneClustersByPostIds(clusters: Cluster[], postIds: string[]): Cluster[] {
  const normalize = (postId: string): string =>
    postId.startsWith('t3_') ? postId.slice(3) : postId;
  const postSet = new Set(postIds.map((postId) => normalize(postId)));

  return clusters
    .map((cluster) => {
      const items = cluster.items.filter((item) => !postSet.has(normalize(item.postId)));
      const buckets = { critical: 0, high: 0, low: 0 };
      for (const item of items) buckets[item.severity]++;
      const itemCount = items.length;

      return {
        ...cluster,
        items,
        buckets,
        itemCount,
        status: itemCount === 0 ? ('resolved' as const) : cluster.status,
      };
    })
    .filter((cluster) => cluster.itemCount > 0);
}
