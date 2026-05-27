// src/client/splash.tsx
// Inline (feed) view. Kept lightweight per Devvit guidance — heavy deps live
// in game.tsx (the expanded dashboard).

import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { context, requestExpandedMode } from '@devvit/web/client';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4 bg-white">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          ModPit
        </h1>
        <p className="text-base text-zinc-600 text-center max-w-md px-6">
          Reported posts grouped into clusters so you can act on patterns,
          not individual items.
        </p>
        <p className="text-sm text-zinc-400">
          Hi {context.username ?? 'mod'} — open the dashboard to triage.
        </p>
      </div>
      <button
        className="mt-2 bg-black text-white px-5 h-10 rounded-full font-medium cursor-pointer hover:bg-zinc-800 transition-colors"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        Open dashboard
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
