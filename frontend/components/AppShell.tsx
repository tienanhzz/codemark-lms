"use client";
import { useI18n } from "./LanguageProvider";

import { Leaderboard } from "./Leaderboard";
import { io } from "../lib/realtime";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { SOCKET_URL, api } from "../lib/api";
import { cn } from "../lib/format";
import type { Role } from "../lib/types";
import { useAuth } from "./AuthProvider";
import { WorkspaceHeader } from "./WorkspaceHeader";
import type { RewardProfile } from "./RewardAppearance";

const ALL: Role[] = ["admin", "teacher", "ta", "student"];

const NAV: Array<{
  href: string;
  label: string;
  icon: string;
  roles: Role[];
}> = [
  { href: "/", label: "Trang chủ", icon: "fa-house", roles: ALL },
  { href: "/rank-adjustment", label: "Điều chỉnh điểm", icon: "fa-pen", roles: ["admin", "teacher"] },
  { href: "/leaderboard", label: "Player Rank", icon: "fa-trophy", roles: ALL },
  { href: "/rewards", label: "Danh hiệu & phần thưởng", icon: "fa-medal", roles: ALL },
  { href: "/admin/rank", label: "Mùa và điểm rank", icon: "fa-ranking-star", roles: ["admin"] },
  { href: "/admin/taxonomy", label: "Danh mục nội dung", icon: "fa-tags", roles: ["admin"] },
  { href: "/dashboard", label: "Tổng quan", icon: "fa-gauge-high", roles: ALL },
  { href: "/schedule", label: "Lịch học tuần", icon: "fa-calendar-days", roles: ALL },
  { href: "/courses", label: "Lớp học", icon: "fa-book-open", roles: ALL },
  { href: "/account", label: "Tài khoản của tôi", icon: "fa-user-gear", roles: ALL },
  { href: "/attendance", label: "Điểm danh", icon: "fa-qrcode", roles: ["student"] },
  { href: "/admin", label: "Tổng quan", icon: "fa-chart-pie", roles: ["admin"] },
  { href: "/admin/users", label: "Tài khoản", icon: "fa-users", roles: ["admin"] },
  { href: "/admin/sessions", label: "Phiên đăng nhập", icon: "fa-signal", roles: ["admin"] },
  { href: "/admin/ip-blacklist", label: "Danh sách IP bị chặn", icon: "fa-ban", roles: ["admin"] },
  { href: "/admin/audit", label: "Nhật ký hoạt động", icon: "fa-clipboard-list", roles: ["admin"] },
];

export function AppShell({ children, publicPage = false }: { children: ReactNode; publicPage?: boolean }) {
  const { tr } = useI18n();
  const { user, loading, remindPasswordChange } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rewardProfile, setRewardProfile] = useState<RewardProfile | null>(null);
  const rewardRequest = useRef(0);

  useEffect(() => {
    let active = true;
    if (!user || user.mustChangePassword) { setRewardProfile(null); return; }
    const refreshRewards = () => {
      const request = ++rewardRequest.current;
      api<RewardProfile>("/api/rank/profile").then(profile => { if (active && request === rewardRequest.current) setRewardProfile(profile); }).catch(() => { if (active && request === rewardRequest.current) setRewardProfile(null); });
    };
    refreshRewards();
    window.addEventListener("lms:points", refreshRewards);
    window.addEventListener("lms:cosmetics", refreshRewards);
    return () => { active = false; window.removeEventListener("lms:points", refreshRewards); window.removeEventListener("lms:cosmetics", refreshRewards); };
  }, [user?.id, user?.role, user?.mustChangePassword]);

  useEffect(() => {
    if (!loading && !user && !publicPage) router.replace("/login");
    if (user?.mustChangePassword && pathname !== "/account") router.replace("/account");
  }, [loading, user, router, pathname, publicPage]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  useEffect(() => {
    if (!user) return;
    const socket = io(SOCKET_URL, { withCredentials: true });
    const beat = () => {
      socket.emit("heartbeat");
      api("/api/auth/heartbeat", { method: "POST" }).catch(() => undefined);
    };
    socket.on("connect", beat);
    const timer = window.setInterval(beat, 30000);
    return () => {
      window.clearInterval(timer);
      socket.disconnect();
    };
  }, [user?.id]);

  useEffect(() => {
    document.getElementById("workspace-content")?.scrollTo({ top: 0 });
  }, [pathname]);

  if (loading && !publicPage) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500">
        <div className="flex items-center gap-3 text-sm">
          <i className="fa-solid fa-circle-notch animate-spin" />{tr("Đang khôi phục phiên…")}</div>
      </div>
    );
  }
  if (!user && !publicPage) return null;

  const items = user ? NAV.filter((item) => item.roles.includes(user.role)) : [
    { href: "/", label: tr("Trang chủ"), icon: "fa-house", roles: ALL },
    { href: "/#announcements", label: tr("Thông báo"), icon: "fa-bullhorn", roles: ALL },
    { href: "/login", label: tr("Đăng nhập"), icon: "fa-right-to-bracket", roles: ALL },
  ];
  const active =
    [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ||
    items[0];

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string, label: string) {
    setOpen(false);
    if (user?.mustChangePassword && href !== "/account") {
      event.preventDefault();
      remindPasswordChange(label);
      if (pathname !== "/account") router.replace("/account");
    }
  }

  return (
    <div className="workspace min-h-screen bg-[#f5f7fa] xl:h-dvh xl:overflow-hidden">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-900">{tr("Chuyển đến nội dung")}</a>
      <aside
        id="workspace-navigation"
        aria-label={tr("Điều hướng chính")}
        className={cn(
          "compact-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#102c36] text-slate-300 transition-all duration-200 lg:visible lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <img src="/branding/favicon.png" alt="Logo Cyb3rT1t@ns" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          <span className="sidebar-label whitespace-nowrap text-lg font-semibold text-white">CodeMark</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="sidebar-label px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100/50">{tr("Không gian học tập")}</p>
          {items.map((item) => {
            const isActive = active?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={tr(item.label)}
                title={tr(item.label)}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => navigate(event, item.href, item.label)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200",
                  isActive
                    ? "border-teal-200/15 bg-teal-200/10 font-semibold text-teal-100"
                    : "border-transparent hover:bg-white/5 hover:text-white",
                )}
              >
                <i aria-hidden="true" className={cn("fa-solid w-4 shrink-0 text-center", item.icon)} />
                <span className="sidebar-label whitespace-nowrap">{tr(item.label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-label m-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium text-teal-100">{tr("Kết nối lớp học của bạn.")}</p>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-400">{tr("Lớp học, lịch học và tiến độ tại một nơi.")}</p>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="lg:pl-20 xl:flex xl:h-full xl:flex-col">
        <WorkspaceHeader rewardProfile={rewardProfile} menuOpen={open} onMenuOpen={() => setOpen(true)} onNavigate={navigate} />
        <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1 xl:flex-row xl:overflow-hidden"><main id="workspace-content" tabIndex={-1} className="workspace-content min-w-0 flex-1 p-4 outline-none sm:p-6 lg:p-8 xl:h-full xl:overflow-y-auto xl:overscroll-contain [scrollbar-gutter:stable]"><div id="drawer-root"/><div id="screen-content">{user?.mustChangePassword && pathname !== "/account" ? <p>{tr("Vui lòng đổi mật khẩu ở trang Tài khoản.")}</p> : children}</div></main>{user && !user.mustChangePassword && pathname !== "/leaderboard" && <aside aria-label={tr("Xếp hạng nhanh")} className="w-full min-w-0 shrink-0 p-4 xl:h-full xl:w-96 xl:overflow-hidden xl:py-4 xl:pl-0 xl:pr-6 2xl:w-[26rem]"><Leaderboard/></aside>}</div>
      </div>
    </div>
  );
}
