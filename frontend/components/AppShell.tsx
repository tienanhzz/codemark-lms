"use client";

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
  { href: "/dashboard", label: "Dashboard", icon: "fa-gauge-high", roles: ALL },
  { href: "/schedule", label: "Weekly Schedule", icon: "fa-calendar-days", roles: ALL },
  { href: "/courses", label: "Courses", icon: "fa-book-open", roles: ALL },
  { href: "/account", label: "My Account", icon: "fa-user-gear", roles: ALL },
  { href: "/attendance", label: "Attendance Check-in", icon: "fa-qrcode", roles: ["student"] },
  { href: "/admin", label: "Overview", icon: "fa-chart-pie", roles: ["admin"] },
  { href: "/admin/users", label: "Users", icon: "fa-users", roles: ["admin"] },
  { href: "/admin/sessions", label: "Active Sessions", icon: "fa-signal", roles: ["admin"] },
  { href: "/admin/ip-blacklist", label: "IP Blacklist", icon: "fa-ban", roles: ["admin"] },
  { href: "/admin/audit", label: "Audit Log", icon: "fa-clipboard-list", roles: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500">
        <div className="flex items-center gap-3 text-sm">
          <i className="fa-solid fa-circle-notch animate-spin" />
          Restoring session…
        </div>
      </div>
    );
  }
  if (!user) return null;

  const items = NAV.filter((item) => item.roles.includes(user.role));
  const active =
    [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ||
    items[0];

  return (
    <div className="workspace min-h-screen bg-[#f5f7fa]">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-900">Skip to content</a>
      <aside
        id="workspace-navigation"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#102c36] text-slate-300 transition-transform duration-200 lg:visible lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <img src="/branding/logo-dark.svg" alt="CodeMark_ClassFlow — Learning, connected" width={360} height={64} className="h-auto w-full" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100/50">Workspace</p>
          {items.map((item) => {
            const isActive = active?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200",
                  isActive
                    ? "border-teal-200/15 bg-teal-200/10 font-semibold text-teal-100"
                    : "border-transparent hover:bg-white/5 hover:text-white",
                )}
              >
                <i className={cn("fa-solid w-4 text-center", item.icon)} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium text-teal-100">Your classroom, connected.</p>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-400">Courses, schedules and progress in one place.</p>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md border border-slate-200 p-2 text-slate-500 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="workspace-navigation"
            >
              <i className="fa-solid fa-bars" />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {active?.label || "Workspace"}
              </p>
              <p className="text-[11px] text-slate-400">
                Your learning workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              title="My account"
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
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <i className="fa-solid fa-arrow-right-from-bracket" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="workspace-content mx-auto max-w-7xl p-4 outline-none sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
