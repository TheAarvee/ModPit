// src/server/data/mockPosts.ts
//
// Type-only file. In the standalone mod-pit app this also exported a
// MOCK_POSTS array. In the Devvit port, the same MockPost shape is
// produced by the onPostReport trigger adapter — see routes/triggers.ts.
//
// The engine (clusterEngine.ts) imports `MockPost` from this exact path,
// so the file name is preserved verbatim to avoid touching engine code.

export interface MockPost {
  id: string;
  title: string;
  body: string;
  reportReason: string;
  reportType: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorAgeDays: number;
  authorKarma: number;
  reportCount: number;
  commentCount: number;
  postScore: number;
  upvoteRatio: number;
  url?: string;
  threadId?: string;
  timestamp: number;
}
