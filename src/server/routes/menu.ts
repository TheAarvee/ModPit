import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';

export const menu = new Hono();
const DASHBOARD_POST_ID_KEY = 'modpit:dashboardPostId';
const MISSING_DASHBOARD_MESSAGE =
  'Open a ModPit custom post once, then use this menu again to reopen it.';

async function resolveDashboardPostId(): Promise<string | undefined> {
  if (context.postId) {
    await redis.set(DASHBOARD_POST_ID_KEY, context.postId);
    return context.postId;
  }

  const stored = await redis.get(DASHBOARD_POST_ID_KEY);
  return typeof stored === 'string' && stored.length > 0 ? stored : undefined;
}

menu.post('/post-create', async (c) => {
  try {
    const postId = await resolveDashboardPostId();
    if (!postId) {
      return c.json<UiResponse>(
        {
          showToast: MISSING_DASHBOARD_MESSAGE,
        },
        200
      );
    }

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error opening dashboard from post-create: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open ModPit dashboard',
      },
      400
    );
  }
});

menu.post('/open-dashboard', async (c) => {
  try {
    const postId = await resolveDashboardPostId();
    if (!postId) {
      return c.json<UiResponse>(
        {
          showToast: MISSING_DASHBOARD_MESSAGE,
        },
        200
      );
    }

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error opening ModPit dashboard: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open ModPit',
      },
      400
    );
  }
});
