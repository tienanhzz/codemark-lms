"use client";

import { Leaderboard } from "./Leaderboard";
import { io } from "../lib/realtime";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { SOCKET_URL, api } from "../lib/api";
import { cn, roleLabel } from "../lib/format";
import type { Role } from "../lib/types";
import { useAuth } from "./AuthProvider";
import { Avatar, Button } from "./ui";

const ALL: Role[] = ["admin", "teacher", "ta", "student"];

const NAV: Array<{
  href: string;
  label: string;
  icon: string;
  roles: Role[];
}> = [
  { href: "/", label: "Trang chủ", icon: "fa-house", roles: ALL },
  { href: "/rank-adjustment", label: "Điều chỉnh điểm", icon: "fa-pen", roles: ["admin", "teacher"] },
  { href: "/leaderboard", label: "Bảng xếp hạng", icon: "fa-trophy", roles: ALL },
  { href: "/admin/rank", label: "Mùa và điểm rank", icon: "fa-ranking-star", roles: ["admin"] },
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
  const { user, loading, logout, remindPasswordChange } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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

  if (loading && !publicPage) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500">
        <div className="flex items-center gap-3 text-sm">
          <i className="fa-solid fa-circle-notch animate-spin" />
          Đang khôi phục phiên…
        </div>
      </div>
    );
  }
  if (!user && !publicPage) return null;

  const items = user ? NAV.filter((item) => item.roles.includes(user.role)) : [
    { href: "/", label: "Trang chủ", icon: "fa-house", roles: ALL },
    { href: "/#announcements", label: "Thông báo", icon: "fa-bullhorn", roles: ALL },
    { href: "/login", label: "Đăng nhập", icon: "fa-right-to-bracket", roles: ALL },
  ];
  const active =
    [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ||
    items[0];

  return (
    <div className="workspace min-h-screen bg-[#f5f7fa]">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-900">Chuyển đến nội dung</a>
      <aside
        id="workspace-navigation"
        aria-label="Điều hướng chính"
        className={cn(
          "compact-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#102c36] text-slate-300 transition-all duration-200 lg:visible lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <img src="/branding/favicon.svg" alt="CodeMark" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
          <span className="sidebar-label whitespace-nowrap text-lg font-semibold text-white">CodeMark</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="sidebar-label px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100/50">Không gian học tập</p>
          {items.map((item) => {
            const isActive = active?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  setOpen(false);
                  if (user?.mustChangePassword && item.href !== "/account") {
                    event.preventDefault();
                    remindPasswordChange(item.label);
                    if (pathname !== "/account") router.replace("/account");
                  }
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200",
                  isActive
                    ? "border-teal-200/15 bg-teal-200/10 font-semibold text-teal-100"
                    : "border-transparent hover:bg-white/5 hover:text-white",
                )}
              >
                <i aria-hidden="true" className={cn("fa-solid w-4 shrink-0 text-center", item.icon)} />
                <span className="sidebar-label whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-label m-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium text-teal-100">Kết nối lớp học của bạn.</p>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-400">Lớp học, lịch học và tiến độ tại một nơi.</p>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="lg:pl-20">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md border border-slate-200 p-2 text-slate-500 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Mở điều hướng"
              aria-expanded={open}
              aria-controls="workspace-navigation"
            >
              <i className="fa-solid fa-bars" />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {active?.label || "Trang chủ"}
              </p>
              <p className="text-[11px] text-slate-400">
                Không gian học tập của bạn
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? <>
            <Link
              href="/account"
              title="Tài khoản của tôi"
              className="flex items-center gap-3 rounded-md px-1 py-1 transition hover:bg-slate-50"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-700">{user.name}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  {roleLabel(user.role)}
                </p>
              </div>
              <Avatar name={user.name} role={user.role} />
            </Link>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Đăng xuất"
              onClick={async () => {
                await logout();
                router.replace("/");
              }}
            >
              <i className="fa-solid fa-arrow-right-from-bracket" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
            </> : <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"><i className="fa-solid fa-right-to-bracket" aria-hidden="true"/> Đăng nhập</Link>}
          </div>
        </header>
        <div className="flex flex-col gap-4 xl:flex-row"><main id="workspace-content" tabIndex={-1} className="workspace-content min-w-0 flex-1 p-4 outline-none sm:p-6 lg:p-8"><div id="drawer-root"/><div id="screen-content">{user?.mustChangePassword && pathname !== "/account" ? <p>Vui lòng đổi mật khẩu ở trang Tài khoản.</p> : children}</div></main>{user && !user.mustChangePassword && <aside className="w-full shrink-0 p-4 xl:sticky xl:top-24 xl:h-[calc(100vh-6rem)] xl:w-80 xl:overflow-y-auto"><Leaderboard/></aside>}</div>
      </div>
    </div>
  );
}
