import type { ReactNode } from "react";
import { cn } from "../lib/format";

export type RewardProfile = {
  role: string;
  season: string | null;
  totalPoints: number;
  globalPoints: number;
  badges: { id: string; title: string; description: string }[];
  unlocks: { frames: { id: string; title: string }[]; themes: { id: string; title: string }[] };
  selectedFrame: string;
  selectedTheme: string;
  position: number | null;
  tier: string | null;
};

export const rewardThemeClasses: Record<string, string> = {
  default: "bg-white",
  twilight: "bg-gradient-to-r from-indigo-100 via-white to-purple-100",
  gold: "bg-gradient-to-r from-amber-100 via-white to-yellow-100",
};

export function AvatarFrame({ frame = "default", children }: { frame?: string; children: ReactNode }) {
  return <span data-avatar-frame={frame} className={cn("inline-flex shrink-0 rounded-full",
    frame === "laurel" && "ring-2 ring-emerald-500 ring-offset-2",
    frame === "champion" && "ring-2 ring-amber-400 ring-offset-2 shadow-[0_0_15px_rgba(251,191,36,0.45)]",
  )}>{children}</span>;
}
