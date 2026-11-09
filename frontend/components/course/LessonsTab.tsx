"use client";
import { confirmInline } from "../InlineConfirm";

import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { Lesson } from "../../lib/types";
import {
  Alert,
  Badge,
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

export function LessonsTab({ course, role }: CourseTabProps) {
  const staff = isStaff(role);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ lessons: Lesson[] }>(`/api/courses/${course.id}/lessons`);
      setLessons(data.lessons);
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
      const body = {
        title: form.get("title"),
        content: form.get("content"),
        position: Number(form.get("position") || 0),
        published: form.get("published") === "on",
      };
      if (editing) {
        await api(`/api/lessons/${editing.id}`, { method: "PATCH", body });
      } else {
        await api(`/api/courses/${course.id}/lessons`, { method: "POST", body });
      }
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(lesson: Lesson) {
    if (!await confirmInline(`Delete lesson “${lesson.title}”?`)) return;
    try {
      await api(`/api/lessons/${lesson.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <Spinner label="Đang tải bài học…" />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card
        title="Bài học"
        subtitle="Tài liệu lớp theo thứ tự"
        actions={
          staff ? (
            <Button
              size="sm"
              onClick={async () => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <i className="fa-solid fa-plus" /> Thêm bài học
            </Button>
          ) : undefined
        }
      >
        {lessons.length ? (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <article key={lesson.id} className="rounded-md border border-slate-100">
                <button
                  onClick={() => setExpanded(expanded === lesson.id ? null : lesson.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{lesson.title}</p>
                    <p className="text-[11px] text-slate-400">
                      Thứ tự {lesson.position} · {formatDateTime(lesson.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!lesson.published && <Badge tone="draft">Bản nháp</Badge>}
                    <i
                      className={`fa-solid fa-chevron-${
                        expanded === lesson.id ? "up" : "down"
                      } text-xs text-slate-400`}
                    />
                  </div>
                </button>
                {expanded === lesson.id && (
                  <div className="border-t border-slate-100 px-3 py-3">
                    <p className="prose-lesson text-sm text-slate-600">
                      {lesson.content || "No content."}
                    </p>
                    {staff && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            setEditing(lesson);
                            setOpen(true);
                          }}
                        >
                          <i className="fa-solid fa-pen" /> Sửa
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(lesson)}>
                          <i className="fa-solid fa-trash" /> Xóa
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="fa-book"
            title="Chưa có bài học"
            description={staff ? "Add the first lesson for this course." : "Your teacher has not published lessons yet."}
          />
        )}
      </Card>

      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit lesson" : "New lesson"}
        width="max-w-2xl"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" form="lesson-form" loading={saving}>
              <i className="fa-solid fa-floppy-disk" /> Lưu bài học
            </Button>
          </>
        }
      >
        <form id="lesson-form" onSubmit={save} className="space-y-3">
          <Field label="Tiêu đề">
            <Input name="title" defaultValue={editing?.title || ""} required />
          </Field>
          <Field label="Nội dung">
            <Textarea
              name="content"
              defaultValue={editing?.content || ""}
              className="min-h-48"
              placeholder="Ghi chú, liên kết và hướng dẫn bài học…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Thứ tự">
              <Input
                name="position"
                type="number"
                defaultValue={editing?.position ?? lessons.length}
              />
            </Field>
            <Field label="Hiển thị">
              <label className="flex items-center gap-2 pt-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={editing ? editing.published : true}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Hiển thị với sinh viên
              </label>
            </Field>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
