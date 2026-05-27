// src/server/store/useClusterStore.ts
//
// Type-only file. In the standalone mod-pit app this also exported a
// `useClusterStore` React hook. In the Devvit port, state lives in Redis
// (see ../redis/redisStore.ts) and the client fetches via /api/clusters.
//
// The engine imports `Cluster` and `ClusterItem` from this exact path,
// so the file name + type names are preserved verbatim.

export interface ClusterItem {
  postId: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorAgeDays: number;
  authorKarma: number;
  reportCount: number;
  commentCount: number;
  postScore: number;
  upvoteRatio: number;
  severity: 'critical' | 'high' | 'low';
  timestamp: number;
  score: number;
  reportReason: string;
  reportType: string;
}

export interface Cluster {
  id: string;
  dominantReason: string;
  dominantType: string;
  label: string;
  fingerprint: string[];
  itemCount: number;
  items: ClusterItem[];
  buckets: { critical: number; high: number; low: number };
  centroidVector: Record<string, number>;
  tokenFrequency: Record<string, number>;
  avgAuthorAgeDays: number;
  avgKarma: number;
  firstSeen: number;
  lastActivity: number;
  threadId?: string;
  status: 'open' | 'escalating' | 'stale' | 'resolved';
}
