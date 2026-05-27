import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import { T3 } from '@devvit/shared-types/tid.js';
import { processPost } from '../engine/clusterEngine';
import { hydrateState, persistState, resetState } from '../redis/redisStore';
import type { MockPost } from '../data/mockPosts';

const MODQUEUE_SEED_LIMIT = 200;
const MODQUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_UPVOTE_RATIO = 0.5;

export const triggers = new Hono();

// On install: clear leftover Redis state and seed from current modqueue.
triggers.post('/on-app-install', async (c) => {
  try {
    await resetState();

    let seededCount = 0;
    try {
      const { clusters, processed } = await seedClustersFromModQueue();
      seededCount = processed;
      await persistState(clusters);
    } catch (error) {
      console.warn('Initial modqueue seeding failed:', error);
    }

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `ModPit initialized in r/${context.subredditName}. Seeded ${seededCount} reported posts.`,
      },
      200
    );
  } catch (error) {
    console.error(`Error initializing ModPit: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to initialize ModPit',
      },
      400
    );
  }
});

// On each post report: convert the trigger payload into a MockPost-shaped
// object and feed it through the unchanged clustering engine.
//
// The Devvit `PostReport` trigger gives us the post + the report reason.
// We hydrate the author's age/karma via reddit.getUserById since those are
// behavioral signals the engine relies on.
triggers.post('/on-post-report', async (c) => {
  try {
    const event = await c.req.json<PostReportEvent>();
    const post = event.post;
    if (!post) {
      return c.json<TriggerResponse>(
        { status: 'error', message: 'PostReport event missing post payload' },
        400
      );
    }

    const adapted = await adaptReportToMockPost(event);

    const { clusters } = await hydrateState();
    const updated = processPost(adapted, clusters);
    await persistState(updated);

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Clustered post ${adapted.id} (reason: ${adapted.reportReason})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error handling PostReport: ${error}`);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to cluster post' },
      400
    );
  }
});

// --- Adapter: PostReport trigger event → engine-shaped MockPost --------

// Subset of the Devvit PostReport trigger payload we care about. The shape
// matches @devvit/web/shared's OnPostReportRequest at runtime; we redeclare
// the relevant fields locally so this file does not depend on which
// @devvit/web release exports the type under what name.
type PostReportEvent = {
  type?: string;
  reason?: string;
  post?: {
    id: string;
    title?: string;
    selftext?: string;
    authorId?: string;
    createdAt?: string | number;
    permalink?: string;
    url?: string;
    numReports?: number;
    numComments?: number;
    upvotes?: number;
    downvotes?: number;
    score?: number;
  };
};

// Reddit "thing" IDs always start with a fixed prefix (e.g. "t2_" for users,
// "t3_" for posts). Devvit's typed APIs use template-literal brands like
// `t2_${string}` to enforce this; we use a type guard instead of a cast so
// we honour the project rule against TS type casts.
function isThingId<P extends string>(
  value: string,
  prefix: P
): value is `${P}${string}` {
  return value.startsWith(prefix);
}

async function adaptReportToMockPost(event: PostReportEvent): Promise<MockPost> {
  const post = event.post!;
  const reportReason = (event.reason ?? 'other').toLowerCase();

  const postId = normalizePostId(post.id);
  let redditPost: Awaited<ReturnType<typeof reddit.getPostById>> | null = null;
  try {
    redditPost = await reddit.getPostById(postId);
  } catch (error) {
    console.warn(`Post lookup failed for ${postId}:`, error);
  }

  const authorName = redditPost?.authorName ?? 'unknown';
  const authorId = post.authorId ?? redditPost?.authorId;

  // Best-effort author enrichment. If anything fails, fall back to safe
  // defaults that won't crash the engine (it just won't have behavioral
  // signal for this post).
  let authorAgeDays = 9999;
  let authorKarma = 0;
  let authorAvatarUrl: string | undefined;
  try {
    if (authorId && isThingId(authorId, 't2_')) {
      const user = await reddit.getUserById(authorId);
      if (user) {
        const created = user.createdAt.getTime();
        if (!Number.isNaN(created)) {
          authorAgeDays = Math.max(0, (Date.now() - created) / 86_400_000);
        }
        authorKarma = user.linkKarma + user.commentKarma;
        authorAvatarUrl = await user.getSnoovatarUrl();
      }
    }
  } catch (e) {
    console.warn(`Author enrichment failed for ${authorName}:`, e);
  }

  const createdMs = redditPost?.createdAt
    ? redditPost.createdAt.getTime()
    : normalizeTimestamp(post.createdAt);

  const reportCountFromEvent = toSafeNumber(post.numReports);
  const reportCountFromApi = redditPost ? redditPost.numberOfReports : 0;
  const reportCount = Math.max(1, reportCountFromEvent, reportCountFromApi);

  const commentCountFromEvent = toSafeNumber(post.numComments);
  const commentCountFromApi = redditPost ? redditPost.numberOfComments : 0;
  const commentCount = Math.max(commentCountFromEvent, commentCountFromApi);

  const upvotes = toSafeNumber(post.upvotes);
  const downvotes = toSafeNumber(post.downvotes);
  const totalVotes = upvotes + downvotes;
  const upvoteRatio = totalVotes > 0
    ? clamp(upvotes / totalVotes, 0, 1)
    : DEFAULT_UPVOTE_RATIO;
  const postScore = typeof post.score === 'number'
    ? post.score
    : redditPost
      ? redditPost.score
      : 0;

  return {
    id: post.id,
    title: redditPost?.title ?? post.title ?? '',
    body: redditPost?.body ?? post.selftext ?? '',
    reportReason,
    reportType: reportReason,
    authorName,
    authorAvatarUrl,
    authorAgeDays,
    authorKarma,
    reportCount,
    commentCount,
    postScore,
    upvoteRatio,
    url: redditPost?.url ?? post.url ?? post.permalink,
    timestamp: Number.isNaN(createdMs) ? Date.now() : createdMs,
  };
}

async function seedClustersFromModQueue(): Promise<{
  clusters: ReturnType<typeof processPost>;
  processed: number;
}> {
  const subreddit = await reddit.getCurrentSubreddit();
  const listing = subreddit.getModQueue({ type: 'post', limit: MODQUEUE_SEED_LIMIT });
  const modqueuePosts = await listing.all();

  let clusters: ReturnType<typeof processPost> = [];
  let processed = 0;
  const cutoffMs = Date.now() - MODQUEUE_MAX_AGE_MS;

  for (const post of modqueuePosts) {
    if (post.approved || post.removed || post.spam) continue;
    if (post.createdAt.getTime() < cutoffMs) continue;
    if (post.numberOfReports <= 0 && post.userReportReasons.length === 0 && post.modReportReasons.length === 0) {
      continue;
    }

    const adapted = await adaptModQueuePostToMockPost(post);
    if (!adapted) continue;
    clusters = processPost(adapted, clusters);
    processed++;
  }

  return { clusters, processed };
}

async function adaptModQueuePostToMockPost(post: Awaited<ReturnType<typeof reddit.getPostById>>): Promise<MockPost | null> {
  const reportReasons = [...post.userReportReasons, ...post.modReportReasons].filter(Boolean);
  const reasonRaw = reportReasons[0] ?? 'other';
  const reportReason = reasonRaw.toLowerCase();

  let authorAgeDays = 9999;
  let authorKarma = 0;
  let authorAvatarUrl: string | undefined;
  try {
    if (post.authorId) {
      const user = await reddit.getUserById(post.authorId);
      if (user) {
        const created = user.createdAt.getTime();
        if (!Number.isNaN(created)) {
          authorAgeDays = Math.max(0, (Date.now() - created) / 86_400_000);
        }
        authorKarma = user.linkKarma + user.commentKarma;
        authorAvatarUrl = await user.getSnoovatarUrl();
      }
    }
  } catch (e) {
    console.warn(`Author enrichment failed for ${post.authorName}:`, e);
  }

  const reportCount = Math.max(post.numberOfReports, reportReasons.length, 1);

  return {
    id: post.id,
    title: post.title,
    body: post.body ?? '',
    reportReason,
    reportType: reportReason,
    authorName: post.authorName,
    authorAvatarUrl,
    authorAgeDays,
    authorKarma,
    reportCount,
    commentCount: post.numberOfComments,
    postScore: post.score,
    upvoteRatio: DEFAULT_UPVOTE_RATIO,
    url: post.url,
    timestamp: post.createdAt.getTime(),
  };
}

function normalizePostId(id: string): ReturnType<typeof T3> {
  const value = id.startsWith('t3_') ? id : `t3_${id}`;
  return T3(value);
}

function normalizeTimestamp(value?: number | string): number {
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value) {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}

function toSafeNumber(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
