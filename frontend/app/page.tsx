"use client";
import Link from "next/link";

import { useI18n } from "../components/LanguageProvider";
import { AppShell } from "../components/AppShell";
import { HomeCarousel } from "../components/HomeCarousel";
import { HomeAnnouncements } from "../components/HomeAnnouncements";

export default function Home() {
  const { tr } = useI18n();
  return <AppShell publicPage>
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{tr("Mỗi ngày, tiến xa hơn.")}</h1>
        </div>
        <a href="#announcements" className="text-sm font-semibold text-teal-800">{tr("Bảng tin mới nhất") + " "}<span aria-hidden="true">↓</span></a>
      </div>
      <HomeCarousel/>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ href: "/courses", icon: "fa-book-open", title: "Lớp học của bạn", text: "Bài học, tài liệu và bài tập" },
          { href: "/schedule", icon: "fa-calendar-days", title: "Lịch học tuần", text: "Chủ động sắp xếp việc học" },
          { href: "/leaderboard", icon: "fa-trophy", title: "Player Rank", text: "Ghi nhận từng bước tiến bộ" }].map(item =>
          <Link key={item.href} href={item.href} className="group flex items-center gap-4 rounded-none border border-slate-200 bg-white p-5 transition hover:border-teal-400 hover:shadow-sm">
            <i aria-hidden="true" className={`fa-solid ${item.icon} rounded-none bg-teal-50 p-3 text-teal-700`}/>
            <div><p className="text-sm font-semibold text-slate-800">{tr(item.title)}</p><p className="mt-1 text-xs text-slate-500">{tr(item.text)}</p></div>
          </Link>)}
      </div>
      <HomeAnnouncements/>
      <footer className="border-t border-slate-200 py-5 text-xs text-slate-500">{tr("CodeMark · Cùng học tập, cùng phát triển.")}</footer>
    </div>
  </AppShell>;
}
