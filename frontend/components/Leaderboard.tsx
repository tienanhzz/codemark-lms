"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { cn, initials } from "../lib/format";
import { useAuth } from "./AuthProvider";
import { Alert, Button, Input, Select } from "./ui";

type Row = {
  userId: number; studentId: string; name: string; position: number;
  tier: string; points: number; mine: boolean;
};
type Data = { season: string | null; rows: Row[]; mine: Row | null; total: number };
const points = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const MEDALS = [
  "border-amber-200 bg-amber-50 text-amber-700",
  "border-slate-200 bg-slate-100 text-slate-600",
  "border-orange-200 bg-orange-50 text-orange-700",
];

export function Leaderboard({ full = false }: { full?: boolean }) {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [course, setCourse] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const requestId = useRef(0);
  const pageSize = full ? 20 : 10;

  useEffect(() => {
    api<{ courses: { id: number; title: string }[] }>("/api/courses")
      .then(d => setCourses(d.courses)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await api<Data>("/api/rank/leaderboard?limit=" + pageSize + "&offset=" + page * pageSize + "&q=" + encodeURIComponent(q) + (course ? "&courseId=" + course : ""));
      if (id !== requestId.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [course, q, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    const interval = window.setInterval(load, 30000);
    const refresh = () => { void load(); };
    window.addEventListener("lms:points", refresh);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("lms:points", refresh);
      requestId.current++;
    };
  }, [load]);

  const podium = full && page === 0 && !q.trim()
    ? (data?.rows.filter(r => r.position <= 3).slice(0, 3) || []) : [];
  const mine = user?.role === "student" ? data?.mine : null;

  function rankRow(r: Row) {
    return <li key={r.userId} aria-current={r.mine ? "true" : undefined}
      className={cn("flex items-center gap-3 rounded-2xl border px-3 py-4 transition-colors sm:px-4",
        full && "sm:gap-5 sm:px-6 sm:py-5",
        r.mine ? "border-teal-300 bg-teal-50/80" : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/80")}>
      <span aria-label={"Hạng " + r.position} className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold tabular-nums", MEDALS[r.position - 1] || "border-transparent bg-slate-50 text-slate-500")}>
        {r.position <= 3 ? <><i aria-hidden="true" className="fa-solid fa-medal text-lg" /><span className="sr-only">{r.position}</span></> : r.position}
      </span>
      {full && <span aria-hidden="true" className={cn("hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 sm:flex", r.mine && "bg-teal-100 text-teal-800")}>{initials(r.name)}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("break-words text-sm font-semibold text-slate-800", full && "sm:text-base")}>{r.name}</p>
          {r.mine && <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">Bạn</span>}
        </div>
        <p className="mt-1 break-all text-xs text-slate-400">{r.studentId}<span className={full ? "sm:hidden" : ""}> · {r.tier}</span></p>
      </div>
      {full && <span className="hidden w-32 shrink-0 text-center sm:block"><span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800"><i aria-hidden="true" className="fa-solid fa-shield-halved" />{r.tier}</span></span>}
      <div className={cn("shrink-0 text-right", full && "sm:w-28")}><p className={cn("text-lg font-bold tabular-nums tracking-tight text-slate-900", full && "sm:text-2xl")}>{points.format(r.points)}</p><p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">điểm</p></div>
    </li>;
  }

  return <section aria-label="Bảng xếp hạng" className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(15,45,58,0.35)]">
    <header className={cn("relative isolate overflow-hidden bg-[#102c36] px-6 pb-7 pt-6 text-white", full && "sm:px-9 sm:py-9")}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-teal-400/10 blur-2xl" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200"><span className="h-1.5 w-1.5 rounded-full bg-teal-300" />Hành trình chinh phục</p>
          <h2 className={cn("text-2xl font-bold tracking-tight", full && "sm:text-4xl")}>Bảng xếp hạng</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Ghi nhận nỗ lực. Bứt phá mỗi ngày.</p>
        </div>
        <span aria-hidden="true" className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/20 bg-amber-200/10 text-xl text-amber-300", full && "sm:h-16 sm:w-16 sm:text-3xl")}><i className="fa-solid fa-trophy" /></span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-teal-100"><i aria-hidden="true" className="fa-regular fa-calendar" />{data?.season || (loading ? "Đang tải mùa…" : "Chưa có mùa hoạt động")}</span>
        {data && <span className="text-slate-300"><strong className="font-semibold text-white">{points.format(data.total)}</strong> sinh viên{q.trim() ? " phù hợp" : " tham gia"}</span>}
      </div>
    </header>
    <div className={cn("space-y-5 p-5", full && "sm:space-y-7 sm:p-8")}>
      <div className={cn("grid gap-3", full && "sm:grid-cols-2")}>
        <label className="min-w-0"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Phạm vi xếp hạng</span>
          <Select className="rounded-xl py-3" value={course} onChange={e => { setCourse(e.target.value); setPage(0); }}>
            <option value="">Toàn trường</option>
            <optgroup label="Lớp của tôi">{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</optgroup>
          </Select>
        </label>
        {full && <label className="min-w-0"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tìm sinh viên</span><div className="relative"><i aria-hidden="true" className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400" /><Input className="rounded-xl py-3 pl-10" placeholder="Nhập tên hoặc mã hiển thị…" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} /></div></label>}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {podium.length > 0 && <div><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Những gương mặt dẫn đầu</p>
        <div className="grid gap-3 sm:grid-cols-3">{podium.map(r => <div key={r.userId} className={cn("relative min-w-0 overflow-hidden rounded-2xl border p-5", r.position === 1 ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white" : "border-slate-200 bg-slate-50/60")}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold", MEDALS[r.position - 1])}><i aria-hidden="true" className={"fa-solid " + (r.position === 1 ? "fa-crown" : "fa-medal")} />Hạng {r.position}</span><span className="text-xs text-slate-500">{r.tier}</span></div>
          <span aria-hidden="true" className={cn("mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold", r.position === 1 ? "bg-amber-100 text-amber-800" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{initials(r.name)}</span>
          <p className="break-words font-semibold text-slate-800">{r.name}{r.mine && <span className="ml-2 text-xs text-teal-700">(Bạn)</span>}</p>
          <p className="mt-1 break-all text-xs text-slate-400">{r.studentId}</p>
          <p className="mt-4 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{points.format(r.points)}<span className="ml-2 text-xs font-medium tracking-normal text-slate-500">điểm</span></p>
        </div>)}</div>
      </div>}
      {mine && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4">
        <div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-white"><i className="fa-solid fa-location-dot" /></span><div><p className="text-xs font-medium text-teal-700">Vị trí của bạn</p><p className="mt-0.5 font-bold text-teal-950">Hạng #{mine.position}<span className="ml-2 text-xs font-normal text-teal-700">{mine.tier}</span></p></div></div>
        <p className="text-xl font-bold tabular-nums text-teal-900">{points.format(mine.points)}<span className="ml-1 text-xs font-medium">điểm</span></p>
      </div>}
      <div aria-busy={loading}>
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-800">{full ? "Bảng thành tích" : "Top 10 sinh viên"}</h3><span className="text-[11px] text-slate-400">{full ? (data?.total || 0) + " kết quả" : "Điểm tích lũy"}</span></div>
        {full && <div aria-hidden="true" className="mb-2 hidden items-center gap-5 px-6 text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:flex"><span className="w-10">Hạng</span><span className="flex-1 pl-16">Sinh viên</span><span className="w-32 text-center">Bậc hạng</span><span className="w-28 text-right">Tổng điểm</span></div>}
        {loading && !data ? <div role="status" className="space-y-3"><span className="sr-only">Đang tải bảng xếp hạng</span>{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          : data?.rows.length ? <ol className={cn("space-y-2", !full && "max-h-[480px] overflow-y-auto overscroll-contain pr-1")}>{data.rows.map(rankRow)}</ol>
          : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center"><i aria-hidden="true" className={"fa-solid " + (error ? "fa-cloud-arrow-down" : q.trim() ? "fa-magnifying-glass" : "fa-ranking-star") + " mb-4 text-3xl text-slate-300"} /><p className="text-sm font-semibold text-slate-700">{error ? "Chưa tải được bảng xếp hạng" : q.trim() ? "Không tìm thấy sinh viên" : "Chưa có thành tích để hiển thị"}</p><p className="mt-2 text-xs leading-6 text-slate-500">{error ? "Bạn có thể thử tải lại bên dưới." : q.trim() ? "Thử tên hoặc mã hiển thị khác." : data?.season ? "Điểm số sẽ xuất hiện khi sinh viên hoàn thành hoạt động học tập." : "Bảng xếp hạng sẽ cập nhật khi mùa mới bắt đầu."}</p></div>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="Làm mới bảng xếp hạng"><i aria-hidden="true" className={cn("fa-solid fa-arrow-rotate-right", loading && "animate-spin")} />Làm mới</Button>
        {!full ? <Link className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600" href="/leaderboard">Xem đầy đủ<i aria-hidden="true" className="fa-solid fa-arrow-right" /></Link>
          : <nav aria-label="Phân trang bảng xếp hạng" className="flex items-center gap-2"><Button variant="secondary" size="sm" aria-label="Trang trước" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}><i aria-hidden="true" className="fa-solid fa-chevron-left" /></Button><span className="px-2 text-xs font-medium tabular-nums text-slate-600">Trang {page + 1} / {Math.max(1, Math.ceil((data?.total || 0) / pageSize))}</span><Button variant="secondary" size="sm" aria-label="Trang sau" disabled={loading || (page + 1) * pageSize >= (data?.total || 0)} onClick={() => setPage(p => p + 1)}><i aria-hidden="true" className="fa-solid fa-chevron-right" /></Button></nav>}
      </footer>
    </div>
  </section>;
}
