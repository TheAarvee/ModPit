import { useMemo, useState } from "react";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { PostCard, type PostCardProps } from "./PostCard";
import type { BulkActionsResponse, BulkModAction, BulkSeverity } from "../../shared/api";
import { MOD_ACTION_OPTIONS } from "../lib/modActions";

interface KanbanColumnProps {
  clusterId: string;
  title: string;
  posts: PostCardProps[];
  theme: BulkSeverity;
  onPostClick: (postId: string) => void;
}

function KanbanColumn({ clusterId, title, posts, theme, onPostClick }: KanbanColumnProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedActions, setSelectedActions] = useState<BulkModAction[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<BulkActionsResponse | null>(null);

  const themeStyles = {
    critical: "bg-[#ffebea] border-[#ffcaca]",
    high: "bg-[#fff1de] border-[#ffe0b2]",
    low: "bg-[#e5ffeb] border-[#bdf1c5]",
  };

  const actionSummary = useMemo(() => {
    if (!lastResult) return null;
    return `${lastResult.successCount} succeeded, ${lastResult.failureCount} failed`;
  }, [lastResult]);

  const toggleAction = (action: BulkModAction) => {
    setSelectedActions((current) =>
      current.includes(action)
        ? current.filter((candidate) => candidate !== action)
        : [...current, action]
    );
  };

  const applyBulkActions = async () => {
    if (selectedActions.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/clusters/${clusterId}/bulk-actions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          severity: theme,
          actions: selectedActions,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: BulkActionsResponse = await response.json();
      setLastResult(result);
      setPickerOpen(false);
    } catch (error) {
      setLastResult({
        type: "bulk-actions",
        clusterId,
        severity: theme,
        totalPosts: posts.length,
        affectedUsers: 0,
        selectedActions,
        successCount: 0,
        failureCount: selectedActions.length,
        errors: [error instanceof Error ? error.message : "Failed to apply actions"],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`rounded-[2.5rem] p-5 min-h-[600px] border-[1.5px] ${themeStyles[theme]}`}>
      <div className="px-2 pt-2 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[1.4rem] font-medium text-black">{title}</h2>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-black text-white text-sm font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            Bulk Actions
          </button>
        </div>

        {pickerOpen && (
          <div className="mt-3 bg-white border border-zinc-200 rounded-2xl p-4">
            <div className="grid grid-cols-1 gap-2">
              {MOD_ACTION_OPTIONS.map((action) => (
                <label key={action.id} className="inline-flex items-center gap-2 text-sm text-black">
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(action.id)}
                    onChange={() => toggleAction(action.id)}
                    className="size-4 accent-black"
                  />
                  <span>{action.label}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={applyBulkActions}
              disabled={selectedActions.length === 0 || isSubmitting}
              className="mt-4 h-9 px-4 rounded-full bg-black text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {isSubmitting ? "Applying..." : "Apply to this split"}
            </button>
          </div>
        )}

        {actionSummary && (
          <p className="mt-3 text-sm text-zinc-700">{actionSummary}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {posts.map((post, idx) => (
          <PostCard key={idx} {...post} onClick={onPostClick} />
        ))}
      </div>
    </div>
  );
}

export interface ClusterBoardProps {
  clusterId: string;
  clusterTitle: string;
  criticalPosts: PostCardProps[];
  highPosts: PostCardProps[];
  lowPosts: PostCardProps[];
  onBack?: () => void;
  onPostClick: (postId: string) => void;
}

export function ClusterBoard({
  clusterId,
  clusterTitle,
  criticalPosts,
  highPosts,
  lowPosts,
  onBack,
  onPostClick,
}: ClusterBoardProps) {
  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-8 -ml-3">
        <button 
          onClick={onBack}
          className="p-3 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer text-black"
          aria-label="Go back to clusters"
        >
          <ChevronLeft className="w-8 h-8" strokeWidth={2.5} />
        </button>
        <h1 className="text-[2.2rem] font-medium tracking-tight text-black">
          {clusterTitle}
        </h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <KanbanColumn clusterId={clusterId} title="Critical" posts={criticalPosts} theme="critical" onPostClick={onPostClick} />
        <KanbanColumn clusterId={clusterId} title="High" posts={highPosts} theme="high" onPostClick={onPostClick} />
        <KanbanColumn clusterId={clusterId} title="Low" posts={lowPosts} theme="low" onPostClick={onPostClick} />
      </div>
    </div>
  );
}
