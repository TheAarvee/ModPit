// Mirror of the engine's Cluster/ClusterItem types, kept in the shared module
// so both client and server can import them without crossing the
// client/server tsconfig boundary (the engine itself lives under
// /src/server and isn't visible to the client tsconfig).
export type ClusterItem = {
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
};

export type Cluster = {
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
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
};

export type ClustersResponse = {
  type: 'clusters';
  clusters: Cluster[];
};

export type ModeratorAvatar = {
  username: string;
  avatarUrl?: string;
};

export type ModeratorsResponse = {
  type: 'moderators';
  moderators: ModeratorAvatar[];
};

export type BulkModAction =
  | 'approve'
  | 'remove'
  | 'mark_spam'
  | 'lock_comments'
  | 'add_user_note'
  | 'send_removal_reason'
  | 'temporary_ban'
  | 'permanent_ban'
  | 'mute_user'
  | 'escalate'
  | 'ignore_reports';

export type BulkSeverity = 'critical' | 'high' | 'low';

export type BulkActionsRequest = {
  severity: BulkSeverity;
  actions: BulkModAction[];
};

export type BulkActionsResponse = {
  type: 'bulk-actions';
  clusterId: string;
  severity: BulkSeverity;
  totalPosts: number;
  affectedUsers: number;
  selectedActions: BulkModAction[];
  successCount: number;
  failureCount: number;
  errors: string[];
};

export type PostActionsRequest = {
  actions: BulkModAction[];
};

export type PostActionsResponse = {
  type: 'post-actions';
  postId: string;
  selectedActions: BulkModAction[];
  successCount: number;
  failureCount: number;
  errors: string[];
};

export type PostDetailsResponse = {
  type: 'post-details';
  postId: string;
  title: string;
  body: string;
  flair?: string;
  severity: BulkSeverity;
  reportCount: number;
  reportType: string;
  timestamp: number;
  author: {
    username: string;
    avatarUrl?: string;
    bannerUrl: string;
    accountAgeDays: number;
    karma: number;
    joinedAt: number;
    profileUrl: string;
  };
};
