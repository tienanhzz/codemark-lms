import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { HomeCarousel } from "../components/HomeCarousel";
import { HomeAnnouncements } from "../components/HomeAnnouncements";

export default function Home() {
  return <AppShell publicPage>
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">CodeMark · Không gian học tập</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Mỗi ngày, tiến xa hơn.</h1>
        </div>
        <a href="#announcements" className="text-sm font-semibold text-teal-800">Bảng tin mới nhất <span aria-hidden="true">↓</span></a>
      </div>
      <HomeCarousel/>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ href: "/courses", icon: "fa-book-open", title: "Lớp học của bạn", text: "Bài học, tài liệu và bài tập" },
          { href: "/schedule", icon: "fa-calendar-days", title: "Lịch học tuần", text: "Chủ động sắp xếp việc học" },
          { href: "/leaderboard", icon: "fa-trophy", title: "Bảng xếp hạng", text: "Ghi nhận từng bước tiến bộ" }].map(item =>
          <Link key={item.href} href={item.href} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-400 hover:shadow-sm">
            <i aria-hidden="true" className={`fa-solid ${item.icon} rounded-xl bg-teal-50 p-3 text-teal-700`}/>
            <div><p className="text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.text}</p></div>
          </Link>)}
      </div>
      <HomeAnnouncements/>
      <footer className="border-t border-slate-200 py-5 text-xs text-slate-500">CodeMark · Cùng học tập, cùng phát triển.</footer>
    </div>
  </AppShell>;
}
