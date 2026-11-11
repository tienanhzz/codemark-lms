"use client";
import { useI18n } from "./LanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, download, errorMessage } from "../lib/api";
import { cn } from "../lib/format";
import { Alert, Button, Input, Select } from "./ui";
import { useAuth } from "./AuthProvider";

type Row = {
  userId: number; studentId: string; name: string; position: number;
  tier: string; points: number; mine: boolean; badge?: string;
};
type Course = { id: number; title: string; code: string; total?: number; rows?: Row[] };
type Data = { season: string | null; rows: Row[]; mine: Row | null; total: number; courses?: Course[] };
const rankStyles: Record<string, string> = {
  Master: "border-purple-300 bg-purple-50 text-purple-800",
  Ruby: "border-red-300 bg-red-50 text-red-800",
  Diamond: "border-blue-300 bg-blue-50 text-blue-800",
  Gold: "border-yellow-300 bg-yellow-50 text-yellow-800",
  Silver: "border-slate-300 bg-slate-100 text-slate-600",
  Bronze: "border-slate-200 bg-white text-slate-700",
};
function RankBadge({ tier }: { tier: string }) {
  return <span className="flex shrink-0 flex-col items-center gap-1">
    <img src={`/ranks/${tier.toLowerCase()}.png`} alt={`Rank ${tier}`} title={tier} width={40} height={36} className="h-9 w-10 object-contain" />
  </span>;
}

export function Leaderboard({ full = false }: { full?: boolean }) {
  const { tr, locale } = useI18n();
  const points = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState("");
  const [q, setQ] = useState("");
  const [audience, setAudience] = useState<"student" | "teacher">("student");
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);
  const teachers = audience === "teacher";
  const unit = teachers ? "Reputation" : "EXP";

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const url = `/api/rank/leaderboard?limit=100&role=${audience}` + (course ? "&courseId=" + course : "");
      const result = await api<Data>(url);
      const rows = [...result.rows];
      while ((course || audience === "teacher") && rows.length < result.total) {
        if (id !== requestId.current) return;
        const next = await api<Data>(url + "&offset=" + rows.length);
        if (!next.rows.length) break;
        rows.push(...next.rows);
      }
      if (id !== requestId.current) return;
      setData({ ...result, rows: [...new Map(rows.map(row => [row.userId, row])).values()] });
      if (!course) setCourses(result.courses || []);
      setError("");
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [course, audience]);

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

  const matches = (row: Row) => `${row.name} ${row.studentId}`.toLocaleLowerCase("vi-VN").includes(q.trim().toLocaleLowerCase("vi-VN"));
  const rows = data?.rows.filter(matches) || [];
  const matchesCourse = (group: Course) => `${group.title} ${group.code}`.toLocaleLowerCase("vi-VN").includes(q.trim().toLocaleLowerCase("vi-VN"));
  const groups = (data?.courses || []).map(group => ({ ...group, rows: matchesCourse(group) ? (group.rows || []).slice(0, 5) : (group.rows || []).slice(0, 5).filter(matches) })).filter(group => !q.trim() || group.rows.length || matchesCourse(group));
  function selectCourse(value: string) { requestId.current++; setCourse(value); setData(null); setLoading(true); setError(""); }
  function selectAudience(value: "student" | "teacher") {
    if (value === audience) return;
    requestId.current++; setAudience(value); setCourse(""); setCourses([]); setData(null); setQ(""); setLoading(true); setError("");
  }
  async function exportTeachers() {
    setExporting(true); setError("");
    try { await download("/api/rank/teachers/report.pdf" + (course ? `?courseId=${course}` : ""), "vinh-danh-giang-vien.pdf"); }
    catch (err) { setError(errorMessage(err)); }
    finally { setExporting(false); }
  }

  function rankRow(r: Row) {
    return <li key={r.userId} aria-current={r.mine ? "true" : undefined}
      className={cn("flex items-center gap-2 px-2 py-1.5 transition-colors sm:px-4",
        full && "sm:gap-3 sm:px-4",
        rankStyles[r.tier] || rankStyles.Bronze)}>
      <span aria-label={tr("Hạng ") + r.position} className="flex h-7 w-7 shrink-0 items-center justify-center text-sm font-bold tabular-nums">
        {r.position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("break-words text-sm font-semibold text-slate-800", full && "sm:text-base")}>{r.name}</p>
          {r.mine && <span className="rounded-none bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">{tr("Bạn")}</span>}
          {r.badge && <span className="text-[10px] font-semibold text-amber-700">{r.badge}</span>}
        </div>
        <p className="mt-0.5 break-all text-xs text-slate-400">{r.studentId}</p>
      </div>
      <div className={cn("shrink-0 text-right", full && "sm:w-28")}><p className={cn("text-lg font-bold tabular-nums tracking-tight", full && "sm:text-xl")}>{points.format(r.points)}</p><p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">{unit}</p></div>
      <RankBadge tier={r.tier} />
    </li>;
  }

  return <section aria-label="Player Rank" className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none border border-slate-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(15,45,58,0.35)]", full ? "h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-9rem)]" : "h-[calc(100dvh-7rem)] xl:h-full")}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-[#102c36] px-5 py-4 text-white">
      <h2 className="text-xl font-bold">{teachers ? "Teacher Rank" : "Player Rank"}</h2>
      <p className="text-xs text-slate-300"><strong className="font-semibold text-white">{data ? points.format(data.total) : "…"}</strong> {teachers ? "giảng viên" : "chiến binh tham gia"}</p>
    </header>
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4 p-4", full && "sm:p-6")}>
      <div aria-label="Đối tượng xếp hạng" className="flex shrink-0 gap-2 border-b border-slate-100 pb-3">
        <Button size="sm" variant={teachers ? "secondary" : "primary"} aria-pressed={!teachers} onClick={() => selectAudience("student")}>{tr("Sinh viên")}</Button>
        <Button size="sm" variant={teachers ? "primary" : "secondary"} aria-pressed={teachers} onClick={() => selectAudience("teacher")}>{tr("Giảng viên")}</Button>
      </div>
      <div className={cn("grid shrink-0 gap-3", full && "sm:grid-cols-2")}>
        <label className="min-w-0"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{tr("Phạm vi xếp hạng")}</span>
          <Select className="rounded-none py-3" value={course} onChange={e => selectCourse(e.target.value)}>
            <option value="">All</option>
            <optgroup label={tr("Lớp học")}>{courses.map(c => <option key={c.id} value={c.id}>{c.title} · {c.code}</option>)}</optgroup>
          </Select>
        </label>
        {full && <label className="min-w-0"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{teachers ? "Tìm giảng viên" : tr("Tìm sinh viên")}</span><div className="relative"><i aria-hidden="true" className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400" /><Input className="rounded-none py-3 pl-10" placeholder="Nhập tên hoặc mã đầy đủ…" value={q} onChange={e => { setQ(e.target.value); }} /></div></label>}
      </div>
      {!course && <p className="shrink-0 text-xs text-slate-500">{teachers ? "Reputation toàn hệ thống · Chọn lớp để xem đóng góp trong lớp." : "Top 5 mỗi lớp · Tìm trong sinh viên đang hiển thị hoặc tên/mã lớp."}</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div aria-busy={loading} aria-label={teachers ? "Danh sách giảng viên xếp hạng" : "Danh sách sinh viên xếp hạng"} tabIndex={0} className="min-h-0 flex-1 overflow-y-scroll overscroll-contain [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
        {full && <div aria-hidden="true" className="mb-2 hidden items-center gap-3 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:flex"><span className="w-7">STT</span><span className="flex-1">{teachers ? tr("Giảng viên") : tr("Sinh viên")}</span><span className="w-28 text-right">{unit}</span><span className="w-10 text-center">Rank</span></div>}
        {loading && !data ? <div role="status" className="space-y-3"><span className="sr-only">Đang tải Player Rank</span>{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-none bg-slate-100" />)}</div>
          : !teachers && !course && groups.length ? <div className="space-y-4">{groups.map(group => <section key={group.id} aria-label={`${group.title} · ${group.code}`} className="border border-slate-200">
            <header className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-800">{group.title}</h3><p className="mt-1 break-all text-xs text-slate-500">{group.code} · {group.total} sinh viên · Top 5</p></div><Button variant="ghost" size="sm" onClick={() => selectCourse(String(group.id))}>Xem lớp</Button></header>
            {group.rows.length ? <ol className="divide-y divide-slate-200">{group.rows.map(rankRow)}</ol> : <p className="p-4 text-sm text-slate-500">Chưa có sinh viên trong lớp.</p>}
          </section>)}</div>
          : (course || teachers) && rows.length ? <ol className="divide-y divide-slate-200">{rows.map(rankRow)}</ol>
          : <div className="rounded-none border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center"><i aria-hidden="true" className={"fa-solid " + (error ? "fa-cloud-arrow-down" : q.trim() ? "fa-magnifying-glass" : "fa-ranking-star") + " mb-4 text-3xl text-slate-300"} /><p className="text-sm font-semibold text-slate-700">{error ? tr("Chưa tải được bảng xếp hạng") : q.trim() ? (teachers ? "Không tìm thấy giảng viên" : tr("Không tìm thấy sinh viên")) : tr("Chưa có thành tích để hiển thị")}</p><p className="mt-2 text-xs leading-6 text-slate-500">{error ? tr("Bạn có thể thử tải lại bên dưới.") : q.trim() ? "Thử tên hoặc mã đầy đủ khác." : data?.season ? (teachers ? "Đóng góp giảng dạy được ghi nhận bằng Reputation." : tr("Điểm số sẽ xuất hiện khi sinh viên hoàn thành hoạt động học tập.")) : tr("Bảng xếp hạng sẽ cập nhật khi mùa mới bắt đầu.")}</p></div>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="Làm mới Player Rank"><i aria-hidden="true" className={cn("fa-solid fa-arrow-rotate-right", loading && "animate-spin")} />{tr("Làm mới")}</Button>
        {teachers && (user?.role === "admin" || user?.role === "teacher") && <Button variant="secondary" size="sm" onClick={exportTeachers} loading={exporting}><i aria-hidden="true" className="fa-solid fa-file-pdf" />Xuất PDF</Button>}
        {!full && <Link className="inline-flex items-center gap-2 px-2 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50" href="/leaderboard">Mở Player Rank<i aria-hidden="true" className="fa-solid fa-arrow-right" /></Link>}
      </footer>
    </div>
  </section>;
}
