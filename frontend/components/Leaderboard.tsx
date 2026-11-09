"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { Alert, Button, Input, Select } from "./ui";
type Row = {
    userId: number;
    studentId: string;
    name: string;
    position: number;
    tier: string;
    points: number;
    mine: boolean;
};
type Data = {
    season: string | null;
    rows: Row[];
    mine: Row | null;
    total: number;
};
export function Leaderboard({ full = false }: {
    full?: boolean;
}) {
    const { user } = useAuth();
    const [data, setData] = useState<Data | null>(null), [error, setError] = useState("");
    const [courses, setCourses] = useState<{
        id: number;
        title: string;
    }[]>([]), [course, setCourse] = useState("");
    const [q, setQ] = useState(""), [page, setPage] = useState(0);
    useEffect(() => { api<{
        courses: {
            id: number;
            title: string;
        }[];
    }>("/api/courses").then(d => setCourses(d.courses)).catch(() => { }); }, []);
    async function load() { try {
        setData(await api<Data>(`/api/rank/leaderboard?limit=${full ? 20 : 10}&offset=${full ? page * 20 : 0}&q=${encodeURIComponent(q)}${course ? `&courseId=${course}` : ""}`));
        setError("");
    }
    catch (e) {
        setError(errorMessage(e));
    } }
    useEffect(() => { load(); const id = setInterval(load, 30000); window.addEventListener("lms:points", load); return () => { clearInterval(id); window.removeEventListener("lms:points", load); }; }, [course, q, page, full]);
    function row(r: Row) {
        return <li key={r.userId} className={`my-2 rounded-lg border p-3 ${r.mine ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"}`}>
        <div className="flex justify-between gap-2">
        <b>#{r.position} {r.name}{r.mine ? " (Bạn)" : ""}</b>
        <span>{r.points} đ</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">{r.studentId} · {r.tier}</div>
        </li>;
    }
    return <section aria-label="Bảng xếp hạng" className="rounded-xl border bg-white p-4">
    <h2 className="text-lg font-bold text-teal-900">Bảng xếp hạng</h2>
    <p className="my-2 text-xs text-slate-500">{data?.season || "Chưa có mùa hoạt động"}</p>
    <Select value={course} onChange={e => { setCourse(e.target.value); setPage(0); }}>
    <option value="">Toàn trường</option>
    <optgroup label="Lớp của tôi">{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</optgroup>
    </Select>{full && <Input aria-label="Tìm kiếm" placeholder="Tìm tên hoặc mã hiển thị" value={q} onChange={e => { setQ(e.target.value); setPage(0); }}/>}{error && <Alert tone="danger">{error}</Alert>}<ol>{data?.rows.map(row)}</ol>{user?.role === "student" && data?.mine && !data.rows.some(r => r.mine) && <>
        <p className="text-xs">Vị trí của bạn</p>
        <ol>{row(data.mine)}</ol>
        </>}<div className="mt-3 flex flex-wrap gap-2">
    <Button size="sm" onClick={load}>Làm mới</Button>{!full && <Link className="text-sm text-teal-800 underline" href="/leaderboard">Xem đầy đủ</Link>}{full && <>
        <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</Button>
        <span>{page + 1}</span>
        <Button size="sm" disabled={(page + 1) * 20 >= (data?.total || 0)} onClick={() => setPage(page + 1)}>Sau</Button>
        </>}</div>
    </section>;
}
