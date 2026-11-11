"use client";
import { useI18n } from "../LanguageProvider";

import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { Alert, Button, Card, Field, Input, Textarea } from "../ui";
import { CourseTabProps, isStaff } from "./types";
type Quiz = {
    id: number;
    title: string;
    url: string;
    description: string;
    dueAt: string;
    maxScore: number;
    results: {
        id: number;
        student: {
            name: string;
            studentId: string;
        };
        score: number | null;
        status: string;
    }[];
};
export function QuizLinksTab({ course, role }: CourseTabProps) {
  const { tr, locale } = useI18n();
    const staff = isStaff(role);
    const [items, setItems] = useState<Quiz[]>([]), [message, setMessage] = useState(""), [create, setCreate] = useState(false), [busy, setBusy] = useState(false), [imports, setImports] = useState<Record<number, string>>({});
    async function load() { try {
        setItems((await api<{
            quizzes: Quiz[];
        }>(`/api/courses/${course.id}/quiz-links`)).quizzes);
    }
    catch (e) {
        setMessage(errorMessage(e));
    } }
    useEffect(() => { load(); }, [course.id]);
    async function act(path: string, body: unknown) { setBusy(true); try {
        const result = await api<any>(path, { method: "POST", body });
        setMessage(result.errors?.length ? `Đã nhập ${result.imported} dòng. Lỗi: ${JSON.stringify(result.errors)}` : "Đã lưu thành công.");
        window.dispatchEvent(new Event("lms:points"));
        await load();
    }
    catch (e) {
        setMessage(errorMessage(e));
    }
    finally {
        setBusy(false);
    } }
    async function add(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await act(`/api/courses/${course.id}/quiz-links`, { title: f.get("title"), url: f.get("url"), description: f.get("description"), dueAt: new Date(String(f.get("dueAt"))).toISOString(), maxScore: Number(f.get("maxScore")) }); }
    return <div className="space-y-4">{message && <Alert>{message}</Alert>}{staff && <>
        <Button onClick={() => setCreate(!create)}>{create ? tr("Quay lại") : tr("Thêm quiz link")}</Button>{create && <Card title={tr("Gán quiz cho lớp")}>
            <p className="mb-4 text-sm">{tr("Yêu cầu sinh viên dùng mã 10 chữ số làm tên trong Wayground/Kahoot/Google Forms. Điểm chỉ cộng sau khi xác nhận.")}</p>
            <form className="space-y-3" onSubmit={add}>
            <Field label={tr("Tiêu đề")}>
            <Input name="title" required/>
            </Field>
            <Field label="URL http/https">
            <Input name="url" type="url" pattern="https?://.*" required/>
            </Field>
            <Field label={tr("Mô tả")}>
            <Textarea name="description"/>
            </Field>
            <Field label={tr("Hạn hoàn thành")}>
            <Input name="dueAt" type="datetime-local" required/>
            </Field>
            <Field label={tr("Điểm tối đa")}>
            <Input name="maxScore" type="number" min="0.01" step="any" required/>
            </Field>
            <Button type="submit" disabled={busy}>{tr("Giao cho lớp") + " "}{course.code}</Button>
            </form>
            </Card>}</>}{items.map(q => <Card key={q.id} title={q.title} subtitle={tr("Hạn: {0} · Điểm tối đa: {1}", { 0: (new Date(q.dueAt).toLocaleString(locale)), 1: (q.maxScore) })}>
        <p>{q.description}</p>
        <a className="my-3 block text-teal-800 underline" href={q.url} target="_blank" rel="noopener noreferrer">{tr("Mở quiz ↗")}</a>{!staff && <>
            <Button disabled={busy} onClick={() => act(`/api/quiz-links/${q.id}/complete`, {})}>{tr("Tôi đã hoàn thành")}</Button>{q.results.map(t => <p key={t.id}>{t.status === "confirmed" ? tr("Đã xác nhận: {0} điểm", { 0: (t.score) }) : tr("Chờ xác nhận")}</p>)}</>}{staff && <>
            <form className="my-4 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); act(`/api/quiz-links/${q.id}/scores`, { studentId: f.get("studentId"), score: Number(f.get("score")) }); }}>
            <Input className="w-44" name="studentId" placeholder={tr("Mã sinh viên")} pattern="[0-9]{10}" required/>
            <Input className="w-32" name="score" type="number" placeholder={tr("Điểm")} min="0" max={q.maxScore} step="any" required/>
            <Button type="submit" disabled={busy}>{tr("Xác nhận điểm")}</Button>
            </form>
            <form className="space-y-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); act(`/api/quiz-links/${q.id}/import`, { csv: imports[q.id] || "", studentColumn: f.get("studentColumn"), scoreColumn: f.get("scoreColumn") }); }}>
            <p className="text-sm">{tr("CSV kết quả Wayground: chọn tên cột chứa mã và điểm. Giới hạn 1 MiB/1000 dòng. Ví dụ: studentId,score")}</p>
            <Input name="studentColumn" defaultValue="studentId" aria-label={tr("Tên cột mã")}/>
            <Input name="scoreColumn" defaultValue="score" aria-label={tr("Tên cột điểm")}/>
            <div className="border-2 border-dashed p-4" onDragOver={e => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.size <= 1048576)
                setImports({ ...imports, [q.id]: await f.text() });
            else
                setMessage("File quá lớn"); }}>{tr("Kéo thả CSV kết quả")}</div>
            <Textarea aria-label={tr("CSV kết quả")} value={imports[q.id] || ""} onChange={e => setImports({ ...imports, [q.id]: e.target.value })}/>
            <Button type="submit" disabled={busy}>{tr("Nhập kết quả và xác nhận")}</Button>
            </form>
            <table className="mt-4 w-full text-left text-sm">
            <thead>
            <tr>
            <th>{tr("Sinh viên")}</th>
            <th>{tr("Trạng thái")}</th>
            <th>{tr("Điểm")}</th>
            </tr>
            </thead>
            <tbody>{q.results.map(t => <tr key={t.id}>
                <td>{t.student.name} · {t.student.studentId}</td>
                <td>{t.status === "confirmed" ? tr("Đã xác nhận") : tr("Chờ xác nhận")}</td>
                <td>{t.score ?? "—"}</td>
                </tr>)}</tbody>
            </table>
            </>}</Card>)}</div>;
}
