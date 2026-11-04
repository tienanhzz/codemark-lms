"use client";

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
  Modal,
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
      await api(`/api/courses/${course.id}/meetings`, {
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
    if (!confirm("Remove this meeting from the weekly schedule?")) return;
    try {
      await api(`/api/courses/${course.id}/meetings/${meetingId}`, { method: "DELETE" });
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
    if (!confirm(`Delete ${course.code} and all of its content? This cannot be undone.`))
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
          label="Students"
          value={stats?.roster.student ?? course.studentCount ?? 0}
          hint={`${stats?.roster.ta ?? 0} teaching assistants`}
          tone="emerald"
        />
        <StatCard
          icon="fa-book"
          label="Lessons"
          value={stats?.lessons ?? course.lessonCount ?? 0}
          hint="Published and draft"
          tone="sky"
        />
        <StatCard
          icon="fa-file-signature"
          label="Assessments"
          value={stats?.assessments ?? course.assessmentCount ?? 0}
          hint={`${stats?.submittedAttempts ?? 0} submissions`}
          tone="amber"
        />
        <StatCard
          icon="fa-star"
          label="Average score"
          value={stats?.averageScore ?? "—"}
          hint="Submitted attempts"
          tone="purple"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Weekly meetings"
          subtitle="Recurring class times for this course"
          actions={
            owner ? (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <i className="fa-solid fa-pen" /> Edit course
              </Button>
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
                      {weekdayName(meeting.weekday)}
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
              title="No meetings yet"
              description="Add a recurring meeting so students see it on their timetable."
            />
          )}

          {scheduleManager && (
            <form
              onSubmit={addMeeting}
              className="mt-4 grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <Field label="Day">
                <Select name="weekday" defaultValue="0">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
              <Field label="Start">
                <Input name="start" type="time" required />
              </Field>
              <Field label="End">
                <Input name="end" type="time" required />
              </Field>
              <Field label="Location">
                <Input name="location" required placeholder="Room A1" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" loading={savingMeeting}>
                  <i className="fa-solid fa-plus" /> Add
                </Button>
              </div>
              {meetingError && (
                <Alert tone="danger" className="lg:col-span-5">
                  {meetingError}
                </Alert>
              )}
            </form>
          )}
        </Card>

        <Card title="Course details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Code</dt>
              <dd className="font-semibold text-slate-700">{course.code}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Term</dt>
              <dd className="text-slate-700">{course.term}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Dates</dt>
              <dd className="text-slate-700">
                {formatDate(course.startDate)} – {formatDate(course.endDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Owner</dt>
              <dd className="text-slate-700">{course.owner?.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">State</dt>
              <dd>
                {course.published ? (
                  <Badge tone="published">Published</Badge>
                ) : (
                  <Badge tone="draft">Draft</Badge>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {course.description || "No description provided."}
          </p>
          {owner && (
            <Button
              variant="danger"
              size="sm"
              className="mt-4 w-full"
              onClick={removeCourse}
            >
              <i className="fa-solid fa-trash" /> Delete course
            </Button>
          )}
        </Card>
      </div>

      {staff && stats && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Roster distribution" subtitle="Course membership by role">
            <BarChart
              data={[
                { label: "Students", value: stats.roster.student || 0 },
                { label: "Teaching assistants", value: stats.roster.ta || 0 },
                { label: "Teachers", value: stats.roster.teacher || 0 },
              ]}
              color="bg-emerald-600"
            />
          </Card>
          <Card title="Course activity" subtitle="Attendance and leave workload">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon="fa-qrcode"
                label="Attendance sessions"
                value={stats.attendanceSessions}
                tone="sky"
              />
              <StatCard
                icon="fa-triangle-exclamation"
                label="Pending leave"
                value={stats.pendingLeave}
                tone="amber"
              />
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit course"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-course-form" loading={saving}>
              <i className="fa-solid fa-floppy-disk" /> Save
            </Button>
          </>
        }
      >
        <form id="edit-course-form" onSubmit={saveCourse} className="grid gap-3 sm:grid-cols-2">
          <Field label="Code">
            <Input value={course.code} disabled />
          </Field>
          <Field label="Term">
            <Input name="term" defaultValue={course.term} required />
          </Field>
          <Field label="Title" className="sm:col-span-2">
            <Input name="title" defaultValue={course.title} required />
          </Field>
          <Field label="Start date">
            <Input name="startDate" type="date" defaultValue={course.startDate} required />
          </Field>
          <Field label="End date">
            <Input name="endDate" type="date" defaultValue={course.endDate} required />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" defaultValue={course.description} />
          </Field>
          <Field label="Publication" className="sm:col-span-2">
            <Select name="published" defaultValue={course.published ? "on" : "off"}>
              <option value="off">Draft</option>
              <option value="on">Published</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
