// src/client/hooks/useClusters.ts
//
// Polls /api/clusters every POLL_MS milliseconds. Replaces the in-memory
// Zustand store from the standalone mod-pit app — clusters are owned by
// Redis on the server and the client only reads them.

import { useEffect, useRef, useState } from 'react';
import type { Cluster, ClustersResponse } from '../../shared/api';

const POLL_MS = 5000;

type State = {
  clusters: Cluster[];
  loading: boolean;
  error: string | null;
};

export const useClusters = () => {
  const [state, setState] = useState<State>({
    clusters: [],
    loading: true,
    error: null,
  });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/clusters');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ClustersResponse = await res.json();
        if (cancelled.current) return;
        setState({ clusters: data.clusters, loading: false, error: null });
      } catch (err) {
        if (cancelled.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch clusters';
        setState((prev) => ({ ...prev, loading: false, error: msg }));
      }
    };

    void fetchOnce();
    const interval = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(interval);
    };
  }, []);

  return state;
};
