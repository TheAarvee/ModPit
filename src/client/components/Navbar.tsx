import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import type { ModeratorAvatar, ModeratorsResponse } from "../../shared/api";
import modpitLogo from "../assets/modpit.png";

function getAvatarUrl(username: string, avatarUrl?: string): string {
  if (avatarUrl) return avatarUrl;
  const defaultId = username
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8;
  return `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${defaultId}.png`;
}

export function Navbar({ onHomeClick }: { onHomeClick?: () => void }) {
  const [moderators, setModerators] = useState<ModeratorAvatar[]>([]);
  const visibleModerators = moderators.slice(0, 3);
  const additionalModeratorsCount = Math.max(0, moderators.length - visibleModerators.length);

  useEffect(() => {
    let cancelled = false;

    const fetchModerators = async () => {
      try {
        const res = await fetch('/api/moderators');
        if (!res.ok) return;
        const data: ModeratorsResponse = await res.json();
        if (!cancelled) setModerators(data.moderators);
      } catch (error) {
        console.warn('Failed to fetch moderator avatars:', error);
      }
    };

    void fetchModerators();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="flex items-center justify-between py-5 px-7">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div
          className="flex items-center justify-center shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95"
          onClick={onHomeClick}
        >
          <img
            src={modpitLogo}
            alt="ModPit"
            className="w-7 h-7 object-contain"
          />
        </div>

        {/* Links */}
        <div className="flex items-center gap-2">
          <button className="px-3.5 py-1.5 bg-[#bdf0ff] text-[#008de6] font-medium rounded-full text-[0.95rem]">
            ModQueue
          </button>
        </div>
      </div>

      <div className="flex items-center gap-5">
        {/* Avatars */}
        {visibleModerators.length > 0 && (
          <div className="flex items-center gap-3">
            <AvatarGroup>
              {visibleModerators.map((moderator) => (
                <Avatar key={moderator.username} className="ring-2 ring-white">
                  <AvatarImage
                    src={getAvatarUrl(moderator.username, moderator.avatarUrl)}
                    alt={moderator.username}
                  />
                  <AvatarFallback>{moderator.username.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
            {additionalModeratorsCount > 0 && (
              <span className="text-zinc-500 font-medium text-[0.95rem]">
                +{additionalModeratorsCount}
              </span>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
