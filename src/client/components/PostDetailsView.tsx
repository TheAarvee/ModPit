import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { navigateTo } from "@devvit/web/client";
import type { BulkModAction, PostActionsResponse, PostDetailsResponse } from "../../shared/api";
import { MOD_ACTION_OPTIONS } from "../lib/modActions";

type PostDetailsViewProps = {
  clusterTitle: string;
  postId: string;
  onBack?: () => void;
};

export function PostDetailsView({ clusterTitle, postId, onBack }: PostDetailsViewProps) {
  const [details, setDetails] = useState<PostDetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedActions, setSelectedActions] = useState<BulkModAction[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PostActionsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDetails = async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/details`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PostDetailsResponse = await res.json();
        if (!cancelled) {
          setDetails(data);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Failed to load post details";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const severityLabel = useMemo(() => details?.severity.toUpperCase() ?? "POST", [details]);
  const createdAtText = useMemo(
    () => details ? new Date(details.timestamp).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
    [details]
  );
  const joinedOnText = useMemo(
    () => details ? new Date(details.author.joinedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "",
    [details]
  );
  const accountAgeText = useMemo(() => {
    if (!details) return "";
    const days = Math.max(0, Math.floor(details.author.accountAgeDays));
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${Math.floor(days / 365)} years`;
  }, [details]);
  const profileUrl = details?.author.profileUrl ?? "";

  const openProfile = () => {
    if (!profileUrl) return;
    const popup = window.open(profileUrl, "_blank", "noopener,noreferrer");
    if (popup) {
      popup.opener = null;
      return;
    }
    navigateTo(profileUrl);
  };

  const toggleAction = (action: BulkModAction) => {
    setSelectedActions((current) =>
      current.includes(action)
        ? current.filter((candidate) => candidate !== action)
        : [...current, action]
    );
  };

  const applyActions = async () => {
    if (selectedActions.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/posts/${postId}/actions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ actions: selectedActions }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: PostActionsResponse = await response.json();
      setResult(payload);
      setModalOpen(false);
    } catch (applyError) {
      setResult({
        type: "post-actions",
        postId,
        selectedActions,
        successCount: 0,
        failureCount: selectedActions.length,
        errors: [applyError instanceof Error ? applyError.message : "Failed to apply actions"],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-zinc-500 py-20 text-center">Loading post details...</div>;
  }

  if (error || !details) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-500">{error ?? "Post details unavailable"}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 h-10 px-4 rounded-full bg-black text-white"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-8 -ml-2">
        <button
          onClick={onBack}
          className="p-2.5 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer text-black"
          aria-label="Go back to cluster"
        >
          <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
        </button>
        <h1 className="text-[1.9rem] font-medium tracking-tight text-black">{clusterTitle}</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.86fr] gap-7 items-start">
        <section>
          <div className="inline-flex items-center h-8 px-3.5 rounded-full border border-red-400 text-red-500 text-xs font-semibold mb-4">
            {severityLabel}
          </div>
          <h2 className="text-3xl leading-tight tracking-tight text-black font-semibold mb-3 max-w-4xl">{details.title}</h2>
          <p className="text-[2rem] leading-snug text-zinc-500 max-w-4xl mb-7 whitespace-pre-wrap">{details.body || "No body text provided."}</p>

          {details.flair && (
            <p className="text-sm text-zinc-700 mb-4">
              Flair: <span className="font-medium text-black">{details.flair}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 mb-7">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="h-10 px-6 rounded-full bg-black text-white text-lg font-medium hover:bg-zinc-800 transition-colors"
            >
              Mod Actions
            </button>
            <span className="text-lg text-zinc-500">{createdAtText}</span>
          </div>

          {result && (
            <p className="text-sm text-zinc-700 mb-5">
              {result.successCount} actions succeeded, {result.failureCount} failed
            </p>
          )}

          <div className="space-y-2 text-[1.9rem]">
            <p className="text-zinc-500">
              No.of Reports <span className="text-black font-medium ml-4">{details.reportCount}</span>
            </p>
            <p className="text-zinc-500">
              Report Type <span className="text-black font-medium ml-4">{details.reportType.toUpperCase()}</span>
            </p>
          </div>
        </section>

        <section className="pt-2">
          <div className="rounded-[1.9rem] bg-zinc-100 px-6 py-5">
            <div className="flex items-center gap-3.5">
              <img
                src={details.author.avatarUrl}
                alt={`${details.author.username} profile`}
                className="size-16 rounded-full object-cover bg-zinc-200 shrink-0"
              />
              <div>
                <h3 className="text-[2.05rem] leading-none font-semibold text-black">{details.author.username}</h3>
                <p className="text-[0.82rem] text-zinc-500 mt-1">u/{details.author.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              <div>
                <p className="text-[2.05rem] leading-none font-medium text-black">{accountAgeText}</p>
                <p className="text-[0.82rem] text-zinc-500 mt-1.5">account age</p>
              </div>
              <div>
                <p className="text-[2.05rem] leading-none font-medium text-black">{details.author.karma}</p>
                <p className="text-[0.82rem] text-zinc-500 mt-1.5">karma</p>
              </div>
              <div>
                <p className="text-[2.05rem] leading-none font-medium text-black">{joinedOnText}</p>
                <p className="text-[0.82rem] text-zinc-500 mt-1.5">joined on</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openProfile}
            className="inline-flex mt-5 h-11 px-7 rounded-full bg-black text-white text-[1.65rem] font-medium hover:bg-zinc-800 transition-colors items-center gap-2"
          >
            View Profile
            <ChevronRight className="size-5" />
          </button>
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7">
            <h4 className="text-2xl font-medium text-black mb-4">Apply Mod Actions</h4>
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {MOD_ACTION_OPTIONS.map((action) => (
                <label key={action.id} className="flex items-center gap-3 text-black text-base">
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
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={applyActions}
                disabled={selectedActions.length === 0 || isSubmitting}
                className="h-10 px-5 rounded-full bg-black text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Applying..." : "Apply Actions"}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-10 px-5 rounded-full border border-zinc-300 text-zinc-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
