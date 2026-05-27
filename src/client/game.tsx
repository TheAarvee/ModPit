// src/client/game.tsx
// Expanded-view dashboard. Polls /api/clusters and renders the mod-pit UI.

import './index.css';
import { useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Navbar } from '@/components/Navbar';
import { ClusterCard } from '@/components/ClusterCard';
import { ClusterBoard } from '@/components/ClusterBoard';
import { PostDetailsView } from '@/components/PostDetailsView';
import { useClusters } from '@/hooks/useClusters';
import type { Cluster, ClusterItem } from '../shared/api';
import type { PostCardProps } from '@/components/PostCard';

function getAvatarUrl(username: string, avatarUrl?: string): string {
  if (avatarUrl) return avatarUrl;
  const defaultId = username
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8;
  return `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${defaultId}.png`;
}

function toPostCardProps(item: ClusterItem): PostCardProps {
  const body = item.body ?? '';
  const excerpt = body.length > 80 ? body.slice(0, 80) + '...' : body;
  return {
    postId: item.postId,
    title: item.title,
    excerpt,
    authorAvatar: getAvatarUrl(item.authorName, item.authorAvatarUrl),
    authorName: item.authorName,
    date: new Date(item.timestamp).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  };
}

function toClusterCardProps(cluster: Cluster) {
  const uniqueAuthors = cluster.items.filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.authorName === item.authorName) === index
  );
  return {
    title: cluster.label,
    totalItems: cluster.itemCount,
    criticalCount: cluster.buckets.critical,
    highCount: cluster.buckets.high,
    lowCount: cluster.buckets.low,
    avatars: uniqueAuthors.slice(0, 3).map((author) => ({
      src: getAvatarUrl(author.authorName, author.authorAvatarUrl),
      alt: author.authorName,
      fallback: author.authorName.charAt(0).toUpperCase(),
    })),
    additionalAvatarsCount: Math.max(0, uniqueAuthors.length - 3),
  };
}

export const App = () => {
  const { clusters, loading, error } = useClusters();
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId) ?? null;
  const visibleClusters = clusters.filter((c) => c.status !== 'resolved');

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      <Navbar
        onHomeClick={() => {
          setSelectedPostId(null);
          setSelectedClusterId(null);
        }}
      />

      <main className="max-w-[1400px] mx-auto px-8 py-10">
        {selectedCluster && selectedPostId ? (
          <PostDetailsView
            clusterTitle={selectedCluster.label}
            postId={selectedPostId}
            onBack={() => setSelectedPostId(null)}
          />
        ) : selectedCluster ? (
          <ClusterBoard
            clusterId={selectedCluster.id}
            clusterTitle={selectedCluster.label}
            criticalPosts={selectedCluster.items
              .filter((i) => i.severity === 'critical')
              .map(toPostCardProps)}
            highPosts={selectedCluster.items
              .filter((i) => i.severity === 'high')
              .map(toPostCardProps)}
            lowPosts={selectedCluster.items
              .filter((i) => i.severity === 'low')
              .map(toPostCardProps)}
            onBack={() => {
              setSelectedPostId(null);
              setSelectedClusterId(null);
            }}
            onPostClick={(postId) => setSelectedPostId(postId)}
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-[2rem] font-medium tracking-tight text-black">
                Clusters
              </h1>
              {loading && (
                <span className="text-sm text-zinc-400 animate-pulse">
                  Loading reports...
                </span>
              )}
              {error && (
                <span className="text-sm text-red-500">Error: {error}</span>
              )}
            </div>

            {visibleClusters.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-zinc-400">
                {loading
                  ? 'Loading...'
                  : 'No clusters yet. Reports will appear here as they arrive.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleClusters
                  .slice()
                  .sort((a, b) => b.buckets.critical - a.buckets.critical)
                  .map((cluster) => (
                    <ClusterCard
                      key={cluster.id}
                      {...toClusterCardProps(cluster)}
                      onClick={() => setSelectedClusterId(cluster.id)}
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
