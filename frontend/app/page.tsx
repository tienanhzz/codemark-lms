"use client";

import { useI18n } from "../components/LanguageProvider";
import { AppShell } from "../components/AppShell";
import { HomeCarousel } from "../components/HomeCarousel";
import { HomeAnnouncements } from "../components/HomeAnnouncements";

export default function Home() {
  const { tr } = useI18n();
  return <AppShell publicPage>
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">{tr("CodeMark · Không gian học tập")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{tr("Mỗi ngày, tiến xa hơn.")}</h1>
        </div>
        <a href="#announcements" className="text-sm font-semibold text-teal-800">{tr("Bảng tin mới nhất") + " "}<span aria-hidden="true">↓</span></a>
      </div>
      <HomeCarousel/>
      <HomeAnnouncements/>
      <footer className="border-t border-slate-200 py-5 text-xs text-slate-500">{tr("CodeMark · Cùng học tập, cùng phát triển.")}</footer>
    </div>
  </AppShell>;
}
