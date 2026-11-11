"use client";
import { useI18n } from "./LanguageProvider";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { Alert, Button, Field, Input } from "./ui";

type Announcement = { id: number; title: string; body: string; createdAt: string; authorId: number; authorName: string; authorRole: string };

export function HomeAnnouncements() {
  const { tr, locale } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const canPublish = !user?.mustChangePassword && (user?.role === "admin" || user?.role === "teacher");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: Announcement[]; total: number }>(`/api/home/announcements?page=${page}`);
      if (page > 1 && data.items.length === 0) { setPage(page - 1); return; }
      setItems(data.items); setTotal(data.total);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setError(""); setNotice("");
    try {
      await api(editing === "new" ? "/api/home/announcements" : `/api/home/announcements/${editing.id}`, {
        method: editing === "new" ? "POST" : "PUT",
        body: { title: data.get("title"), body: data.get("body") },
      });
      setEditing(null); setNotice("Đã lưu thông báo công khai.");
      if (page !== 1) setPage(1); else await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    setSaving(true); setError(""); setNotice("");
    try {
      await api(`/api/home/announcements/${id}`, { method: "DELETE" });
      setDeleting(null); setNotice("Đã xóa thông báo."); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  return <section id="announcements" className="scroll-mt-36 md:scroll-mt-24">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{tr("Cập nhật từ CodeMark")}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{tr("Bảng tin & thông báo")}</h2><p className="mt-2 text-sm text-slate-500">{tr("Thông tin công khai từ quản trị viên và giảng viên.")}</p></div>
      <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading || saving}>{tr("Làm mới")}</Button>{canPublish && <Button size="sm" onClick={() => { setEditing("new"); setNotice(""); }}>{tr("Đăng thông báo")}</Button>}</div>
    </div>
    <div aria-live="polite" className="space-y-3">{error && <Alert tone="danger">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}</div>
    {editing && canPublish && <form key={editing === "new" ? "new" : editing.id} onSubmit={save} className="my-5 space-y-4 rounded-2xl border border-teal-200 bg-white p-6">
      <h3 className="font-semibold">{editing === "new" ? tr("Đăng thông báo mới") : tr("Sửa thông báo")}</h3>
      <Alert>{tr("Thông báo này hiển thị cho mọi người, kể cả người chưa đăng nhập. Thông báo riêng của lớp vẫn đăng trong trang lớp học.")}</Alert>
      <Field label={tr("Tiêu đề")}><Input name="title" required maxLength={180} defaultValue={editing === "new" ? "" : editing.title}/></Field>
      <Field label={tr("Nội dung")}><textarea name="body" required maxLength={10000} rows={5} defaultValue={editing === "new" ? "" : editing.body} className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-teal-600"/></Field>
      <div className="flex gap-2"><Button type="submit" loading={saving}>{tr("Lưu thông báo")}</Button><Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(null)}>{tr("Hủy")}</Button></div>
    </form>}
    <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-busy={loading}>
      {loading ? <p className="p-8 text-sm text-slate-500">{tr("Đang tải thông báo…")}</p> : items.length === 0 ? <div className="p-10 text-center"><i className="fa-regular fa-bell text-3xl text-teal-600" aria-hidden="true"/><p className="mt-3 font-semibold">{error ? tr("Chưa tải được bảng tin") : tr("Chưa có thông báo công khai")}</p><p className="mt-2 text-sm text-slate-500">{error ? tr("Bấm Làm mới để thử lại.") : tr("Thông báo mới từ quản trị viên và giảng viên sẽ xuất hiện tại đây.")}</p></div> : items.map(item => <article key={item.id} className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className={`rounded-full px-3 py-1 font-semibold ${item.authorRole === "admin" ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800"}`}>{item.authorRole === "admin" ? tr("Quản trị viên") : tr("Giảng viên")}</span><span>{item.authorName}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale)}</time></div>
        <h3 className="mt-3 break-words text-lg font-semibold text-slate-900">{item.title}</h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{item.body}</p>
        {canPublish && (user?.role === "admin" || user?.id === item.authorId) && <div className="mt-4 flex flex-wrap items-center gap-2">
          {deleting === item.id ? <><span className="text-sm text-rose-700">{tr("Xóa thông báo này?")}</span><Button size="sm" variant="danger" disabled={saving} onClick={() => void remove(item.id)}>{tr("Xác nhận")}</Button><Button size="sm" variant="secondary" disabled={saving} onClick={() => setDeleting(null)}>{tr("Hủy")}</Button></> : <><Button size="sm" variant="secondary" disabled={saving} onClick={() => { setEditing(item); document.getElementById("announcements")?.scrollIntoView({ block: "start" }); }}>{tr("Sửa")}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => setDeleting(item.id)}>{tr("Xóa")}</Button></>}
        </div>}
      </article>)}
    </div>
    {total > 10 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><Button variant="secondary" size="sm" disabled={page === 1 || loading || saving} onClick={() => setPage(page - 1)}>{tr("Trang trước")}</Button><span>{tr("Trang") + " "}{page} / {Math.ceil(total / 10)}</span><Button variant="secondary" size="sm" disabled={page * 10 >= total || loading || saving} onClick={() => setPage(page + 1)}>{tr("Trang sau")}</Button></div>}
  </section>;
}
