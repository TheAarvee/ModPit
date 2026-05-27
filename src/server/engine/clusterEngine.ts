// src/engine/clusterEngine.ts
// STEP 3 - Cluster by report reason, then score severity within each cluster.

import type { MockPost } from '../data/mockPosts'
import type { Cluster, ClusterItem } from '../store/useClusterStore'
import { assignSeverity } from './severity'

type ClusterHit = {
  cluster: Cluster
  itemIndex: number
}

type RecalculateOptions = {
  preserveLastActivity?: boolean
}

export function processPost(
  post: MockPost,
  openClusters: Cluster[]
): Cluster[] {
  const normalized = normalizePost(post)
  const existing = findClusterByPostId(openClusters, normalized.id)

  if (existing) {
    const updated = updateExistingItem(existing.cluster, existing.itemIndex, normalized)
    return openClusters.map(c => c.id === updated.id ? updated : c)
  }

  const reasonCluster = openClusters.find(
    c => c.dominantReason === normalized.reportReason && c.status !== 'resolved'
  )

  if (reasonCluster) {
    const updated = addPostToCluster(reasonCluster, normalized)
    return openClusters.map(c => c.id === updated.id ? updated : c)
  }

  const created = createCluster(normalized)
  return [...openClusters, created]
}

export function normalizeClusters(clusters: Cluster[]): Cluster[] {
  return clusters.map(cluster => recalculateCluster(cluster, { preserveLastActivity: true }))
}

function normalizePost(post: MockPost): MockPost {
  const postScore = toSafeNumber(post.postScore)
  const upvoteRatio = clamp(toSafeNumber(post.upvoteRatio, 0.5), 0, 1)

  return {
    ...post,
    reportCount: Math.max(1, toSafeNumber(post.reportCount, 1)),
    commentCount: Math.max(0, toSafeNumber(post.commentCount)),
    postScore,
    upvoteRatio
  }
}

function findClusterByPostId(
  clusters: Cluster[],
  postId: string
): ClusterHit | null {
  for (const cluster of clusters) {
    const itemIndex = cluster.items.findIndex(i => i.postId === postId)
    if (itemIndex >= 0) return { cluster, itemIndex }
  }
  return null
}

function updateExistingItem(
  cluster: Cluster,
  itemIndex: number,
  post: MockPost
): Cluster {
  const items = cluster.items.map((item, index) => {
    if (index !== itemIndex) return item
    const existingReports = Math.max(0, toSafeNumber(item.reportCount))
    const nextReportCount = Math.max(existingReports + 1, post.reportCount)
    const nextPostScore = toSafeNumber(post.postScore)
    const nextUpvoteRatio = clamp(toSafeNumber(post.upvoteRatio, 0.5), 0, 1)

    return {
      ...item,
      authorName: post.authorName,
      authorAvatarUrl: post.authorAvatarUrl,
      authorAgeDays: post.authorAgeDays,
      authorKarma: post.authorKarma,
      reportCount: nextReportCount,
      commentCount: post.commentCount,
      postScore: nextPostScore,
      upvoteRatio: nextUpvoteRatio
    }
  })

  return recalculateCluster({ ...cluster, items })
}

function addPostToCluster(cluster: Cluster, post: MockPost): Cluster {
  const items = [...cluster.items, createClusterItem(post)]
  return recalculateCluster({ ...cluster, items })
}

function createCluster(post: MockPost): Cluster {
  const now = Date.now()
  const cluster: Cluster = {
    id: `cluster_${now}_${Math.random().toString(36).slice(2, 6)}`,
    dominantReason: post.reportReason,
    dominantType: post.reportType,
    fingerprint: [],
    label: buildLabel(post.reportReason),
    itemCount: 1,
    items: [createClusterItem(post)],
    buckets: { critical: 0, high: 0, low: 0 },
    centroidVector: {},
    tokenFrequency: {},
    avgAuthorAgeDays: post.authorAgeDays,
    avgKarma: post.authorKarma,
    firstSeen: now,
    lastActivity: now,
    threadId: post.threadId,
    status: 'open'
  }

  return recalculateCluster(cluster)
}

function createClusterItem(post: MockPost): ClusterItem {
  return {
    postId: post.id,
    title: post.title,
    body: post.body,
    authorName: post.authorName,
    authorAvatarUrl: post.authorAvatarUrl,
    authorAgeDays: post.authorAgeDays,
    authorKarma: post.authorKarma,
    reportCount: post.reportCount,
    commentCount: post.commentCount,
    postScore: post.postScore,
    upvoteRatio: post.upvoteRatio,
    severity: 'low',
    timestamp: post.timestamp,
    score: 0,
    reportReason: post.reportReason,
    reportType: post.reportType
  }
}

function recalculateCluster(
  cluster: Cluster,
  options: RecalculateOptions = {}
): Cluster {
  const reportCounts = cluster.items.map(i => Math.max(1, toSafeNumber(i.reportCount, 1)))
  const maxReports = Math.max(1, ...reportCounts)

  const items = cluster.items.map((item) => {
    const reportCount = Math.max(1, toSafeNumber(item.reportCount, 1))
    const commentCount = Math.max(0, toSafeNumber(item.commentCount))
    const postScore = toSafeNumber(item.postScore)
    const upvoteRatio = clamp(toSafeNumber(item.upvoteRatio, 0.5), 0, 1)

    const result = assignSeverity({
      authorAgeDays: toSafeNumber(item.authorAgeDays),
      authorKarma: toSafeNumber(item.authorKarma),
      reportCount,
      maxReportsInCluster: maxReports,
      commentCount,
      postScore,
      upvoteRatio
    })

    return {
      ...item,
      reportCount,
      commentCount,
      postScore,
      upvoteRatio,
      severity: result.tier,
      score: result.score
    }
  })

  const buckets = { critical: 0, high: 0, low: 0 }
  for (const item of items) buckets[item.severity]++

  const itemCount = items.length
  const avgAuthorAgeDays = itemCount === 0
    ? 0
    : items.reduce((sum, i) => sum + toSafeNumber(i.authorAgeDays), 0) / itemCount
  const avgKarma = itemCount === 0
    ? 0
    : items.reduce((sum, i) => sum + toSafeNumber(i.authorKarma), 0) / itemCount

  const minutesActive = (Date.now() - cluster.firstSeen) / 60000
  const velocity = itemCount / Math.max(minutesActive, 1)
  const lastActivity = options.preserveLastActivity ? cluster.lastActivity : Date.now()

  return {
    ...cluster,
    items,
    buckets,
    itemCount,
    avgAuthorAgeDays,
    avgKarma,
    label: buildLabel(cluster.dominantReason),
    lastActivity,
    status: velocity > 2 && minutesActive < 15 ? 'escalating' : 'open'
  }
}

function buildLabel(reason: string): string {
  return capitalize(reason)
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function toSafeNumber(value?: number, fallback: number = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
