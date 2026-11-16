"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { Attempt, Question } from "../lib/types";
import { Alert, Button, Drawer, Field, Input, Spinner, Textarea } from "./ui";

type Details = Attempt & { answers?: Record<string, string>; questions?: Question[] };

export function TeacherGradePanel({ attemptId, onClose, onSaved }: { attemptId: number | null; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true; setData(null); setError("");
    if (attemptId !== null) api<Details>(`/api/attempts/${attemptId}`).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [attemptId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data || saving) return;
    const form = new FormData(event.currentTarget);
    const inlineFeedback: Record<string, string> = {};
    for (const question of data.questions || []) {
      const comment = String(form.get(`comment-${question.id}`) || "").trim();
      if (comment) inlineFeedback[question.id] = comment;
    }
    setSaving(true); setError("");
    try {
      await api(`/api/attempts/${data.id}/grade`, { method: "PATCH", body: { score: Number(form.get("score")), feedback: form.get("feedback"), inlineFeedback } });
      onSaved(); onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }
  return <Drawer open={attemptId !== null} onClose={onClose} title="Chấm bài và sửa lỗi">
    {data && <p className="mb-4 text-sm text-slate-500">{data.student?.name || "Sinh viên"} · Lượt làm #{data.id}</p>}
    {error && <Alert tone="danger">{error}</Alert>}
    {!data && !error ? <Spinner label="Đang tải bài làm…" /> : data && <form key={data.id} onSubmit={save} className="space-y-5">
      <Field label={`Điểm / ${data.maxScore}`}><Input name="score" type="number" min={0} max={data.maxScore} step="any" required defaultValue={data.score ?? 0} /></Field>
      <Field label="Nhận xét tổng thể"><Textarea name="feedback" rows={5} maxLength={20000} defaultValue={data.teacherFeedback || ""} placeholder="Chỉ ra điểm mạnh, lỗi cần sửa và hướng cải thiện cụ thể." /></Field>
      <p className="text-xs leading-6 text-slate-500">Feedback từ 200 ký tự kèm ít nhất một nhận xét sửa lỗi từ 30 ký tự theo câu hỏi được ghi nhận 7 Reputation, một lần mỗi lượt làm bài.</p>
      {(data.questions || []).map(question => <section key={question.id} className="space-y-3 border border-slate-200 p-4">
        <h3 className="whitespace-pre-wrap text-sm font-semibold">{question.prompt}</h3>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-slate-50 p-3 text-xs">{data.answers?.[question.id] || "Chưa trả lời"}</pre>
        <Field label="Sửa lỗi / góp ý cho câu này"><Textarea name={`comment-${question.id}`} maxLength={4000} rows={3} defaultValue={data.inlineFeedback?.[question.id] || ""} /></Field>
      </section>)}
      <Button type="submit" loading={saving}>Lưu điểm và feedback</Button>
    </form>}
  </Drawer>;
}
