"use client";
import { useI18n } from "../LanguageProvider";

import { confirmInline } from "../InlineConfirm";

import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, roleLabel } from "../../lib/format";
import type { Announcement } from "../../lib/types";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Drawer,
  Spinner,
  Textarea,
} from "../ui";
import { isStaff, type CourseTabProps } from "./types";

export function AnnouncementsTab({ course, role, user }: CourseTabProps) {
  const { tr, language, locale } = useI18n();
  const staff = isStaff(role);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ announcements: Announcement[] }>(
        `/api/courses/${course.id}/announcements`,
      );
      setItems(data.announcements);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [course.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(`/api/courses/${course.id}/announcements`, {
        method: "POST",
        body: { title: form.get("title"), body: form.get("body") },
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Announcement) {
    if (!await confirmInline(tr("Xóa thông báo này?"))) return;
    try {
      await api(`/api/announcements/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <Spinner label={tr("Đang tải thông báo…")} />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card
        title={tr("Thông báo")}
        subtitle={tr("Thông báo cho toàn lớp")}
        actions={
          staff ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <i className="fa-solid fa-bullhorn" />{" " + tr("Thêm thông báo")}</Button>
          ) : undefined
        }
      >
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-md border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <Avatar name={item.author?.name} role={item.author?.role} />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.author?.name || tr("Staff")} ·{" "}
                        {roleLabel(item.author?.role, language)} · {formatDateTime(item.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                  {(staff || item.author?.id === user.id) && (
                    <Button size="sm" variant="ghost" onClick={() => remove(item)}>
                      <i className="fa-solid fa-trash text-rose-500" />
                    </Button>
                  )}
                </div>
                <p className="prose-lesson mt-2 text-sm text-slate-600">{item.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon="fa-bullhorn" title={tr("Chưa có thông báo")} />
        )}
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={tr("Thêm thông báo")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{tr("Hủy")}</Button>
            <Button type="submit" form="announcement-form" loading={saving}>{tr("Công bố")}</Button>
          </>
        }
      >
        <form id="announcement-form" onSubmit={save} className="space-y-3">
          <Field label={tr("Tiêu đề")}>
            <Input name="title" required />
          </Field>
          <Field label={tr("Nội dung")}>
            <Textarea name="body" className="min-h-40" />
          </Field>
        </form>
      </Drawer>
    </div>
  );
}
