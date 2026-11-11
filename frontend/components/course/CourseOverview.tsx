"use client";
import { useI18n } from "../LanguageProvider";

import { confirmInline } from "../InlineConfirm";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "../../lib/api";
import { formatDate, weekdayName } from "../../lib/format";
import type { Course, Meeting } from "../../lib/types";
import {
  Alert,
  Badge,
  BarChart,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Drawer,
  Select,
  StatCard,
  Textarea,
} from "../ui";
import { type CourseTabProps } from "./types";

type CourseStats = {
  roster: Record<string, number>;
  lessons: number;
  assessments: number;
  submittedAttempts: number;
  averageScore: number | null;
  attendanceSessions: number;
  pendingLeave: number;
  meetings: Meeting[];
};

export function CourseOverview({ course, role, user, refreshCourse }: CourseTabProps) {
  const { tr, language, locale } = useI18n();
  const router = useRouter();
  const staff = role === "admin" || role === "teacher" || role === "ta";
  const owner = role === "admin" || course.ownerId === user.id;
  const scheduleManager = owner || role === "ta";
  const [stats, setStats] = useState<CourseStats | null>(null);
  const [error, setError] = useState("");
  const [meetingError, setMeetingError] = useState("");
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!staff) return;
    api<CourseStats>(`/api/courses/${course.id}/stats`)
      .then(setStats)
      .catch((err) => setError(errorMessage(err)));
  }, [course.id, staff]);

  async function addMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingMeeting(true);
    setMeetingError("");
    try {
      await api(`/api/courses/${course.id}/buổi học`, {
        method: "POST",
        body: {
          weekday: Number(form.get("weekday")),
          start: form.get("start"),
          end: form.get("end"),
          location: form.get("location"),
        },
      });
      (event.target as HTMLFormElement).reset();
      await refreshCourse();
    } catch (err) {
      setMeetingError(errorMessage(err));
    } finally {
      setSavingMeeting(false);
    }
  }

  async function removeMeeting(meetingId: number) {
    if (!await confirmInline(tr("Gỡ buổi học này khỏi lịch tuần?"))) return;
    try {
      await api(`/api/courses/${course.id}/buổi học/${meetingId}`, { method: "DELETE" });
      await refreshCourse();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(`/api/courses/${course.id}`, {
        method: "PATCH",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          term: form.get("term"),
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          published: form.get("published") === "on",
        },
      });
      setEditOpen(false);
      await refreshCourse();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeCourse() {
    if (!await confirmInline(`Delete ${course.code} and all of its content? This cannot be undone.`))
      return;
    try {
      await api(`/api/courses/${course.id}`, { method: "DELETE" });
      router.push("/courses");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="fa-user-group"
          label={tr("Sinh viên")}
          value={stats?.roster.student ?? course.studentCount ?? 0}
          hint={tr("{0} teaching assistants", { 0: (stats?.roster.ta ?? 0) })}
          tone="emerald"
        />
        <StatCard
          icon="fa-book"
          label={tr("Bài học")}
          value={stats?.lessons ?? course.lessonCount ?? 0}
          hint={tr("Đã công bố và bản nháp")}
          tone="sky"
        />
        <StatCard
          icon="fa-file-signature"
          label={tr("Bài tập và bài thi")}
          value={stats?.assessments ?? course.assessmentCount ?? 0}
          hint={tr("{0} submissions", { 0: (stats?.submittedAttempts ?? 0) })}
          tone="amber"
        />
        <StatCard
          icon="fa-star"
          label={tr("Điểm trung bình")}
          value={stats?.averageScore ?? "—"}
          hint={tr("Lượt làm đã nộp")}
          tone="purple"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={tr("Lịch học hàng tuần")}
          subtitle={tr("Lịch học lặp lại hàng tuần của lớp")}
          actions={
            owner ? (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <i className="fa-solid fa-pen" />{" " + tr("Sửa lớp học")}</Button>
            ) : undefined
          }
        >
          {course.meetings?.length ? (
            <div className="divide-y divide-slate-100">
              {course.meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {weekdayName(meeting.weekday, language)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {meeting.start}–{meeting.end} · {meeting.location}
                    </p>
                  </div>
                  {scheduleManager && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMeeting(meeting.id)}
                    >
                      <i className="fa-solid fa-trash text-rose-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-calendar-xmark"
              title={tr("Chưa có buổi học")}
              description={tr("Thêm lịch học lặp lại để sinh viên xem trên thời khóa biểu.")}
            />
          )}

          {scheduleManager && (
            <form
              onSubmit={addMeeting}
              className="mt-4 grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <Field label={tr("Thứ")}>
                <Select name="weekday" defaultValue="0">
                  {[tr("Mon"), tr("Tue"), tr("Wed"), tr("Thu"), tr("Fri"), tr("Sat"), tr("Sun")].map(
                    (day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
              <Field label={tr("Bắt đầu")}>
                <Input name="start" type="time" required />
              </Field>
              <Field label={tr("Kết thúc")}>
                <Input name="end" type="time" required />
              </Field>
              <Field label={tr("Địa điểm")}>
                <Input name="location" required placeholder={tr("Phòng A1")} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" loading={savingMeeting}>
                  <i className="fa-solid fa-plus" />{" " + tr("Thêm")}</Button>
              </div>
              {meetingError && (
                <Alert tone="danger" className="lg:col-span-5">
                  {meetingError}
                </Alert>
              )}
            </form>
          )}
        </Card>

        <Card title={tr("Thông tin lớp")}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{tr("Mã")}</dt>
              <dd className="font-semibold text-slate-700">{course.code}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{tr("Học kỳ")}</dt>
              <dd className="text-slate-700">{course.term}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{tr("Thời gian")}</dt>
              <dd className="text-slate-700">
                {formatDate(course.startDate, locale)} – {formatDate(course.endDate, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{tr("Phụ trách")}</dt>
              <dd className="text-slate-700">{course.owner?.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{tr("Trạng thái")}</dt>
              <dd>
                {course.published ? (
                  <Badge tone="published">{tr("Đã công bố")}</Badge>
                ) : (
                  <Badge tone="draft">{tr("Bản nháp")}</Badge>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {course.description || tr("No description provided.")}
          </p>
          {owner && (
            <Button
              variant="danger"
              size="sm"
              className="mt-4 w-full"
              onClick={removeCourse}
            >
              <i className="fa-solid fa-trash" />{" " + tr("Xóa lớp học")}</Button>
          )}
        </Card>
      </div>

      {staff && stats && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={tr("Phân bố thành viên")} subtitle={tr("Thành viên lớp theo vai trò")}>
            <BarChart
              data={[
                { label: tr("Sinh viên"), value: stats.roster.student || 0 },
                { label: tr("Trợ giảng"), value: stats.roster.ta || 0 },
                { label: tr("Giảng viên"), value: stats.roster.teacher || 0 },
              ]}
              color="bg-emerald-600"
            />
          </Card>
          <Card title={tr("Hoạt động lớp")} subtitle={tr("Điểm danh và nghỉ phép")}>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon="fa-qrcode"
                label={tr("Phiên điểm danh")}
                value={stats.attendanceSessions}
                tone="sky"
              />
              <StatCard
                icon="fa-triangle-exclamation"
                label={tr("Đơn nghỉ chờ duyệt")}
                value={stats.pendingLeave}
                tone="amber"
              />
            </div>
          </Card>
        </div>
      )}

      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={tr("Sửa lớp học")}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>{tr("Hủy")}</Button>
            <Button type="submit" form="edit-course-form" loading={saving}>
              <i className="fa-solid fa-floppy-disk" />{" " + tr("Lưu")}</Button>
          </>
        }
      >
        <form id="edit-course-form" onSubmit={saveCourse} className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Mã")}>
            <Input value={course.code} disabled />
          </Field>
          <Field label={tr("Học kỳ")}>
            <Input name="term" defaultValue={course.term} required />
          </Field>
          <Field label={tr("Tiêu đề")} className="sm:col-span-2">
            <Input name="title" defaultValue={course.title} required />
          </Field>
          <Field label={tr("Ngày bắt đầu")}>
            <Input name="startDate" type="date" defaultValue={course.startDate} required />
          </Field>
          <Field label={tr("Ngày kết thúc")}>
            <Input name="endDate" type="date" defaultValue={course.endDate} required />
          </Field>
          <Field label={tr("Mô tả")} className="sm:col-span-2">
            <Textarea name="description" defaultValue={course.description} />
          </Field>
          <Field label={tr("Công bố")} className="sm:col-span-2">
            <Select name="published" defaultValue={course.published ? "on" : "off"}>
              <option value="off">{tr("Bản nháp")}</option>
              <option value="on">{tr("Đã công bố")}</option>
            </Select>
          </Field>
        </form>
      </Drawer>
    </div>
  );
}
