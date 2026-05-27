// src/engine/severity.ts
// STEP 2 - Severity scoring within a report-reason cluster.

export type Severity = 'critical' | 'high' | 'low'

export type SeverityInputs = {
  authorAgeDays: number
  authorKarma: number
  reportCount: number
  maxReportsInCluster: number
  commentCount: number
  postScore: number
  upvoteRatio: number
}

export type SeverityResult = {
  score: number
  tier: Severity
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toSafeNumber(value: number, fallback: number = 0): number {
  return Number.isFinite(value) ? value : fallback
}

export function assignSeverity(inputs: SeverityInputs): SeverityResult {
  const authorAgeDays = toSafeNumber(inputs.authorAgeDays)
  const authorKarma = toSafeNumber(inputs.authorKarma)
  const reportCount = Math.max(0, toSafeNumber(inputs.reportCount))
  const maxReports = Math.max(1, toSafeNumber(inputs.maxReportsInCluster, 1))
  const commentCount = Math.max(0, toSafeNumber(inputs.commentCount))
  const postScore = Math.max(0, toSafeNumber(inputs.postScore))
  const upvoteRatio = clamp(toSafeNumber(inputs.upvoteRatio, 0.5), 0, 1)

  const ageRisk = 100 * (1 - Math.min(authorAgeDays / 365, 1))
  const karmaRisk = 100 * (1 - Math.min(authorKarma / 5000, 1))
  const accountRisk = (ageRisk * 0.5) + (karmaRisk * 0.5)

  const reportIntensity = clamp((reportCount / maxReports) * 100, 0, 100)

  const commentImpact = Math.min(commentCount / 100, 1) * 100
  const estimatedDownvotes = upvoteRatio > 0
    ? (postScore * (1 - upvoteRatio)) / upvoteRatio
    : 0
  const voteImpact = Math.min(estimatedDownvotes / 100, 1) * 100

  const engagementImpact =
    (commentImpact * 0.5) +
    (voteImpact * 0.5)

  const rawScore =
    (accountRisk * 0.40) +
    (reportIntensity * 0.35) +
    (engagementImpact * 0.25)

  const score = clamp(Math.round(rawScore), 0, 100)
  const tier: Severity =
    score >= 80 ? 'critical' :
    score >= 55 ? 'high' :
    'low'

  return { score, tier }
}
