"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { Alert, Button, Field, Input } from "./ui";

type Announcement = { id: number; title: string; body: string; createdAt: string; authorId: number; authorName: string; authorRole: string };

const tierText: Record<string, string> = {
  Master: "text-purple-300", Ruby: "text-rose-300", Diamond: "text-sky-300",
  Gold: "text-yellow-300", Silver: "text-slate-100",
};

function ChronicleBody({ body, system }: { body: string; system: boolean }) {
  if (!system) return <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">{body}</p>;
  return <div className="mt-4 space-y-3">{body.split("\n").filter(Boolean).map((line, index) =>
    <p key={index} className="border-l-2 border-amber-500/40 bg-black/20 px-4 py-3 text-sm leading-7 text-slate-300 [overflow-wrap:anywhere]">
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} className={`font-extrabold ${tierText[part.slice(2, -2)] || (part.includes("EXP") ? "text-amber-300" : "text-amber-100")}`}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>)}
    </p>)}</div>;
}

export function HomeAnnouncements() {
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
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("lms:points", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("lms:points", refresh); };
  }, [load]);

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

  return <section id="announcements" aria-label="Thông báo" className="scroll-mt-24">
    <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
      <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading || saving}>Làm mới</Button>{canPublish && <Button size="sm" onClick={() => { setEditing("new"); setNotice(""); }}>Đăng thông báo</Button>}</div>
    </div>
    <div aria-live="polite" className="space-y-3">{error && <Alert tone="danger">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}</div>
    {editing && canPublish && <form key={editing === "new" ? "new" : editing.id} onSubmit={save} className="my-5 space-y-4 rounded-none border border-teal-200 bg-white p-6">
      <h3 className="font-semibold">{editing === "new" ? "Đăng thông báo mới" : "Sửa thông báo"}</h3>
      <Alert>Thông báo này hiển thị cho mọi người, kể cả người chưa đăng nhập. Thông báo riêng của lớp vẫn đăng trong trang lớp học.</Alert>
      <Field label="Tiêu đề"><Input name="title" required maxLength={180} defaultValue={editing === "new" ? "" : editing.title}/></Field>
      <Field label="Nội dung"><textarea name="body" required maxLength={10000} rows={5} defaultValue={editing === "new" ? "" : editing.body} className="w-full rounded-none border border-slate-300 p-3 text-sm focus:outline-teal-600"/></Field>
      <div className="flex gap-2"><Button type="submit" loading={saving}>Lưu thông báo</Button><Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(null)}>Hủy</Button></div>
    </form>}
    <div className="w-full">
      <img src="/announcements.png" alt="Announcements" width={689} height={268} className="block h-auto w-full max-w-none object-contain drop-shadow-[0_10px_25px_rgba(180,125,20,0.25)]" />
    </div>
    <div className="space-y-4 border border-amber-700/50 bg-[#10151f] p-3 shadow-[0_15px_50px_-15px_rgba(15,23,42,0.5)] sm:p-5" aria-busy={loading}>
      {loading ? <p role="status" className="p-8 text-sm text-amber-100/70">Đang mở biên niên sử…</p> : items.length === 0 ? <div className="p-10 text-center text-amber-100"><i className="fa-solid fa-scroll text-3xl text-amber-400" aria-hidden="true"/><p className="mt-3 font-semibold">{error ? "Chưa tải được bảng tin" : "Biên niên sử đang chờ chiến tích mới"}</p><p className="mt-2 text-sm text-slate-300">{error ? "Bấm Làm mới để thử lại." : "Những chiến binh từ Gold trở lên sẽ được ghi danh tại đây khi đổi bậc hạng."}</p></div> : items.map(item => <article key={item.id} className="relative border border-amber-600/30 bg-gradient-to-br from-[#242a35] via-[#191f2a] to-[#141922] p-5 shadow-[inset_0_1px_0_rgba(251,191,36,0.1)] sm:p-7">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300"><span className="border border-amber-500/30 bg-amber-400/10 px-3 py-1 font-semibold text-amber-200"><i aria-hidden="true" className={`fa-solid ${item.authorRole === "system" ? "fa-shield-halved" : "fa-scroll"} mr-2`} />{item.authorRole === "system" ? "Biên niên chiến hạng" : item.authorRole === "admin" ? "Quản trị viên" : "Giảng viên"}</span><span>{item.authorName}</span><time className="sm:ml-auto" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("vi-VN")}</time></div>
        <h3 className="mt-4 break-words font-sans text-xl font-bold leading-8 tracking-normal text-amber-100 sm:text-2xl">{item.title}</h3>
        <ChronicleBody body={item.body} system={item.authorRole === "system"} />
        {canPublish && item.authorRole !== "system" && (user?.role === "admin" || user?.id === item.authorId) && <div className="mt-4 flex flex-wrap items-center gap-2">
          {deleting === item.id ? <><span className="text-sm text-rose-300">Xóa thông báo này?</span><Button size="sm" variant="danger" disabled={saving} onClick={() => void remove(item.id)}>Xác nhận</Button><Button size="sm" variant="secondary" disabled={saving} onClick={() => setDeleting(null)}>Hủy</Button></> : <><Button size="sm" variant="secondary" disabled={saving} onClick={() => { setEditing(item); document.getElementById("announcements")?.scrollIntoView({ block: "start" }); }}>Sửa</Button><Button size="sm" variant="ghost" className="text-amber-200 hover:bg-amber-400/10 hover:text-amber-100" disabled={saving} onClick={() => setDeleting(item.id)}>Xóa</Button></>}
        </div>}
      </article>)}
    </div>
    {total > 10 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><Button variant="secondary" size="sm" disabled={page === 1 || loading || saving} onClick={() => setPage(page - 1)}>Trang trước</Button><span>Trang {page} / {Math.ceil(total / 10)}</span><Button variant="secondary" size="sm" disabled={page * 10 >= total || loading || saving} onClick={() => setPage(page + 1)}>Trang sau</Button></div>}
  </section>;
}
