"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { cn, formatDate } from "../../../lib/format";
import type { Course, User } from "../../../lib/types";
import { useAuth } from "../../../components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Drawer,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "../../../components/ui";

const COURSE_COLORS = [
  {
    card: "border-sky-200 border-l-sky-300 bg-sky-50/70 hover:border-sky-300 hover:bg-sky-100/70 focus-visible:ring-sky-500",
    label: "text-sky-800",
    icon: "text-sky-600",
    divider: "border-sky-200/70",
  },
  {
    card: "border-violet-200 border-l-violet-300 bg-violet-50/70 hover:border-violet-300 hover:bg-violet-100/70 focus-visible:ring-violet-500",
    label: "text-violet-800",
    icon: "text-violet-600",
    divider: "border-violet-200/70",
  },
  {
    card: "border-amber-200 border-l-amber-300 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-100/70 focus-visible:ring-amber-500",
    label: "text-amber-800",
    icon: "text-amber-600",
    divider: "border-amber-200/70",
  },
  {
    card: "border-emerald-200 border-l-emerald-300 bg-emerald-50/70 hover:border-emerald-300 hover:bg-emerald-100/70 focus-visible:ring-emerald-500",
    label: "text-emerald-800",
    icon: "text-emerald-600",
    divider: "border-emerald-200/70",
  },
  {
    card: "border-rose-200 border-l-rose-300 bg-rose-50/70 hover:border-rose-300 hover:bg-rose-100/70 focus-visible:ring-rose-500",
    label: "text-rose-800",
    icon: "text-rose-600",
    divider: "border-rose-200/70",
  },
  {
    card: "border-cyan-200 border-l-cyan-300 bg-cyan-50/70 hover:border-cyan-300 hover:bg-cyan-100/70 focus-visible:ring-cyan-500",
    label: "text-cyan-800",
    icon: "text-cyan-600",
    divider: "border-cyan-200/70",
  },
];

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [ownerCode, setOwnerCode] = useState("");
  const canCreate = user?.role === "admin" || user?.role === "teacher";

  async function load() {
    try {
      const data = await api<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter(
      (course) =>
        course.code.toLowerCase().includes(term) ||
        course.title.toLowerCase().includes(term) ||
        course.term.toLowerCase().includes(term) ||
        (course.owner?.name || "").toLowerCase().includes(term),
    );
  }, [courses, search]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setFormError("");
    try {
      const body: Record<string, unknown> = {
        code: form.get("code"),
        title: form.get("title"),
        description: form.get("description"),
        term: form.get("term"),
        startDate: form.get("startDate"),
        endDate: form.get("endDate"),
        published: form.get("published") === "on",
      };
      if (user?.role === "admin" && ownerCode.trim()) {
        const found = await api<{ users: User[] }>(
          `/api/users/search?q=${encodeURIComponent(ownerCode.trim())}`,
        );
        const owner = found.users.find(
          (candidate) => candidate.studentId.toLowerCase() === ownerCode.trim().toLowerCase(),
        );
        if (!owner) throw new Error("Owner account not found.");
        body.ownerId = owner.id;
      }
      await api("/api/courses", { method: "POST", body });
      setCreateOpen(false);
      setOwnerCode("");
      setLoading(true);
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Đang tải lớp học…" />;

  return (
    <div>
      <PageHeader
        icon="fa-book-open"
        title="Lớp học"
        description={
          user?.role === "student"
            ? "Courses you are enrolled in for the current and previous terms."
            : "Deliver content, rosters, attendance and assessments."
        }
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <i className="fa-solid fa-plus" />
              Thêm lớp học
            </Button>
          ) : undefined
        }
      />

      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm mã lớp, tiêu đề, học kỳ hoặc giảng viên"
            className="pl-8"
          />
        </div>
        <span className="text-xs text-slate-500">
          {filtered.length} of {courses.length} lớp học
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="fa-book-open"
          title={courses.length ? "No matching courses" : "No courses yet"}
          description={
            canCreate
              ? "Create the first course to start adding meetings and content."
              : "Your teacher will add you to a course roster."
          }
          action={
            canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                <i className="fa-solid fa-plus" /> Tạo lớp học
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => {
            // A course keeps its color when the list is searched or reordered.
            const colors = COURSE_COLORS[(course.id - 1) % COURSE_COLORS.length];
            return (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className={cn(
                "group flex flex-col rounded-2xl border border-l-4 p-5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                colors.card,
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={cn("text-xs font-bold uppercase tracking-wide", colors.label)}>
                    {course.code}
                  </p>
                  <h2 className="mt-1 line-clamp-2 text-base font-semibold text-slate-800">
                    {course.title}
                  </h2>
                </div>
                <Badge tone={course.role === "teacher" ? "teacher" : course.role || "student"}>
                  {course.role}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 min-h-8 text-xs text-slate-600">
                {course.description || "No description provided."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span>
                  <i className={cn("fa-solid fa-calendar mr-1", colors.icon)} />
                  {course.term}
                </span>
                <span>
                  <i className={cn("fa-solid fa-clock mr-1", colors.icon)} />
                  {course.meetings?.length || 0} buổi học
                </span>
                <span>
                  <i className={cn("fa-solid fa-user-group mr-1", colors.icon)} />
                  {course.studentCount ?? 0} sinh viên
                </span>
                <span>
                  <i className={cn("fa-solid fa-file-signature mr-1", colors.icon)} />
                  {course.assessmentCount ?? 0} bài kiểm tra
                </span>
              </div>
              <div className={cn("mt-4 flex items-center justify-between border-t pt-3 text-[11px] text-slate-500", colors.divider)}>
                <span>
                  {formatDate(course.startDate)} – {formatDate(course.endDate)}
                </span>
                <span>
                  {course.published ? (
                    <Badge tone="published">Đã công bố</Badge>
                  ) : (
                    <Badge tone="draft">Bản nháp</Badge>
                  )}
                </span>
              </div>
            </Link>
            );
          })}
        </div>
      )}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo lớp học"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="create-course-form" loading={saving}>
              <i className="fa-solid fa-floppy-disk" /> Lưu lớp học
            </Button>
          </>
        }
      >
        <form id="create-course-form" onSubmit={createCourse} className="grid gap-3 sm:grid-cols-2">
          <Field label="Mã lớp">
            <Input name="code" required placeholder="CS101" maxLength={32} />
          </Field>
          <Field label="Học kỳ">
            <Input name="term" required placeholder="Học kỳ 1 năm 2026" maxLength={64} />
          </Field>
          <Field label="Tiêu đề" className="sm:col-span-2">
            <Input name="title" required placeholder="Nhập môn khoa học máy tính" />
          </Field>
          <Field label="Ngày bắt đầu">
            <Input name="startDate" type="date" required />
          </Field>
          <Field label="Ngày kết thúc">
            <Input name="endDate" type="date" required />
          </Field>
          {user?.role === "admin" && (
            <Field
              label="Mã giảng viên phụ trách (tùy chọn)"
              hint="Để trống nếu bạn là giảng viên phụ trách."
              className="sm:col-span-2"
            >
              <Input
                value={ownerCode}
                onChange={(event) => setOwnerCode(event.target.value)}
                type="text" inputMode="numeric" pattern="[0-9]{10}" maxLength={10}
                placeholder="1000000001"
              />
            </Field>
          )}
          <Field label="Mô tả" className="sm:col-span-2">
            <Textarea name="description" placeholder="Đề cương và mục tiêu lớp học" />
          </Field>
          <Field label="Công bố" className="sm:col-span-2">
            <Select name="published" defaultValue="off">
              <option value="off">Bản nháp — ẩn với sinh viên</option>
              <option value="on">Công bố — hiển thị với sinh viên trong lớp</option>
            </Select>
          </Field>
          {formError && (
            <Alert tone="danger" className="sm:col-span-2">
              {formError}
            </Alert>
          )}
        </form>
      </Drawer>
    </div>
  );
}
