"use client";
import { useI18n } from "./LanguageProvider";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MouseEvent } from "react";
import { cn, roleLabel } from "../lib/format";
import { useAuth } from "./AuthProvider";
import { Avatar, Button } from "./ui";
import { LanguageSwitcher } from "./LanguageSwitcher";

const LINKS = [
  { href: "/", label: "Trang chủ", icon: "fa-house" },
  { href: "/courses", label: "Lớp học", icon: "fa-book-open" },
  { href: "/schedule", label: "Lịch học", icon: "fa-calendar-days" },
  { href: "/leaderboard", label: "Bảng xếp hạng", icon: "fa-trophy" },
];

type HeaderProps = {
  menuOpen: boolean;
  onMenuOpen: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string, label: string) => void;
};

export function WorkspaceHeader({ menuOpen, onMenuOpen, onNavigate }: HeaderProps) {
  const { tr, language } = useI18n();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white">
      <div className="flex min-h-28 flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
        <Link href="/" aria-label={tr("CodeMark — Trang chủ")} onClick={(event) => onNavigate(event, "/", "Trang chủ")} className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <img src="/branding/logo.png" alt="Cyb3rT1t@ns — We Are Bigger On The Inside" width={1156} height={359} className="h-auto w-56 max-w-full sm:w-72" />
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {user ? <>
            <Link href="/account" title={tr("Tài khoản của tôi")} className="flex items-center gap-3 rounded-md px-1 py-1 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              <div className="hidden text-right sm:block">
                <p className="max-w-36 truncate text-sm font-semibold text-slate-700">{user.name}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{roleLabel(user.role, language)}</p>
              </div>
              <Avatar name={user.name} role={user.role} />
            </Link>
            <Button variant="secondary" size="sm" aria-label={tr("Đăng xuất")} onClick={async () => { await logout(); router.replace("/"); }}>
              <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
              <span className="hidden sm:inline">{tr("Đăng xuất")}</span>
            </Button>
          </> : <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-3 py-2.5 text-xs font-semibold text-white hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:px-4 sm:text-sm">
            <i className="fa-solid fa-right-to-bracket" aria-hidden="true" />{tr("Đăng nhập")}</Link>}
        </div>
      </div>

      <div className="flex min-h-14 items-center gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-4 lg:px-8">
        <button type="button" onClick={onMenuOpen} aria-label={tr("Mở điều hướng")} aria-expanded={menuOpen} aria-controls="workspace-navigation" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:hidden">
          <i className="fa-solid fa-bars" aria-hidden="true" />
        </button>
        <nav aria-label={tr("Truy cập nhanh")} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {LINKS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} onClick={(event) => onNavigate(event, item.href, item.label)} className={cn(
              "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 sm:px-4 sm:text-sm",
              isActive ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-teal-50 hover:text-teal-800",
            )}>
              <i className={cn("fa-solid hidden sm:inline-block", item.icon)} aria-hidden="true" />{tr(item.label)}
            </Link>;
          })}
        </nav>
        <Link href="/#announcements" title={tr("Thông báo")} aria-label={tr("Xem thông báo")} onClick={(event) => onNavigate(event, "/#announcements", "Thông báo")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <i className="fa-regular fa-bell" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
