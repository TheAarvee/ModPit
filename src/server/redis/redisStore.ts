// src/server/redis/redisStore.ts
//
// Persists the clustering engine's runtime state in Devvit Redis.
// Replaces the in-memory Zustand store from the standalone mod-pit app.
//
// State held in Redis:
//   modpit:clusters    JSON array of Cluster objects
//
// On every PostReport trigger we:
//   1. hydrateState()  — pull clusters from Redis into memory
//   2. processPost(...) — run the clustering engine
//   3. persistState()  — write the new state back to Redis

import { redis } from '@devvit/web/server';
import { normalizeClusters } from '../engine/clusterEngine';
import type { Cluster } from '../store/useClusterStore';

const CLUSTERS_KEY = 'modpit:clusters';
const LEGACY_VECTORIZER_KEY = 'modpit:vectorizer';

export type ClusterState = {
  clusters: Cluster[];
};

// Pull all engine state from Redis and return clusters.
// Safe to call before every request — if Redis is empty (cold install)
// this returns an empty cluster list.
export async function hydrateState(): Promise<ClusterState> {
  const clustersJson = await redis.get(CLUSTERS_KEY);
  const clusters: Cluster[] = clustersJson ? JSON.parse(clustersJson) : [];
  return { clusters: normalizeClusters(clusters) };
}

// Write the engine state back to Redis after a processPost() run.
export async function persistState(clusters: Cluster[]): Promise<void> {
  await redis.set(CLUSTERS_KEY, JSON.stringify(clusters));
}

// Read-only fetch for the dashboard (GET /api/clusters).
export async function readClusters(): Promise<Cluster[]> {
  const clustersJson = await redis.get(CLUSTERS_KEY);
  const clusters: Cluster[] = clustersJson ? JSON.parse(clustersJson) : [];
  return normalizeClusters(clusters);
}

// Wipe everything (used by the AppInstall trigger to start fresh).
export async function resetState(): Promise<void> {
  await Promise.all([redis.del(CLUSTERS_KEY), redis.del(LEGACY_VECTORIZER_KEY)]);
}
