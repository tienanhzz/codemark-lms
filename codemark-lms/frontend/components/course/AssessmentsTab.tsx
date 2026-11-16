"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { Assessment } from "../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Drawer,
  Select,
  Spinner,
  Textarea,
} from "../ui";
import { isStaff, type CourseTabProps } from "./types";

export function AssessmentsTab({ course, role }: CourseTabProps) {
  const staff = isStaff(role);
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ assessments: Assessment[] }>(
        `/api/courses/${course.id}/assessments`,
      );
      setItems(data.assessments);
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
      const allowlist = String(form.get("ipAllowlist") || "")
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      await api(`/api/courses/${course.id}/assessments`, {
        method: "POST",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          kind: form.get("kind"),
          opensAt: new Date(String(form.get("opensAt"))).toISOString(),
          closesAt: new Date(String(form.get("closesAt"))).toISOString(),
          gradingDueAt: form.get("gradingDueAt") ? new Date(String(form.get("gradingDueAt"))).toISOString() : null,
          durationMinutes: Number(form.get("durationMinutes")),
          maxAttempts: Number(form.get("maxAttempts")),
          difficulty: form.get("difficulty"),
          published: form.get("published") === "on",
          ipAllowlist: allowlist,
        },
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Đang tải bài kiểm tra…" />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card
        title="Bài tập và bài thi"
        subtitle="Bài tập, bài thi và bài lập trình"
        actions={
          staff ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <i className="fa-solid fa-plus" /> Tạo bài kiểm tra
            </Button>
          ) : undefined
        }
      >
        {items.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((assessment) => {
              const attempts = assessment.myAttempts || [];
              const inProgress = attempts.find((attempt) => attempt.status === "in_progress");
              const submitted = attempts.filter((attempt) => attempt.status === "submitted");
              return (
                <Link
                  key={assessment.id}
                  href={`/assessments/${assessment.id}`}
                  className="flex flex-col rounded-md border border-slate-100 p-3 transition hover:border-teal-200 hover:bg-teal-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {assessment.title}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        {assessment.kind}
                      </p>
                    </div>
                    {assessment.published ? (
                      <Badge tone="published">Đã công bố</Badge>
                    ) : (
                      <Badge tone="draft">Bản nháp</Badge>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-8 text-xs text-slate-500">
                    {assessment.description || "No description."}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p>
                      <i className="fa-regular fa-clock mr-1" />
                      {formatDateTime(assessment.opensAt)} →{" "}
                      {formatDateTime(assessment.closesAt)}
                    </p>
                    <p>
                      <i className="fa-solid fa-hourglass-half mr-1" />
                      {assessment.durationMinutes} phút · {assessment.maxAttempts} lượt làm(s)
                    </p>
                    {staff ? (
                      <p>
                        <i className="fa-solid fa-list-check mr-1" />
                        {assessment.questionCount ?? 0} câu hỏi ·{" "}
                        {assessment.attemptCount ?? 0} lượt làm
                      </p>
                    ) : (
                      <p>
                        <i className="fa-solid fa-user-check mr-1" />
                        {submitted.length} đã nộp
                        {inProgress ? " · 1 in progress" : ""}
                        {submitted.length
                          ? ` · best ${Math.max(
                              ...submitted.map((attempt) => attempt.score || 0),
                            )}`
                          : ""}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="fa-file-signature"
            title="Chưa có bài kiểm tra"
            description={
              staff
                ? "Create a quiz or code challenge and publish it when ready."
                : "Your teacher has not published an assessment yet."
            }
          />
        )}
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Tạo bài kiểm tra"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="assessment-form" loading={saving}>
              <i className="fa-solid fa-floppy-disk" /> Lưu
            </Button>
          </>
        }
      >
        <form id="assessment-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Field label="Độ khó" hint="Đạt từ 50% nhận EXP một lần">
            <Select name="difficulty" defaultValue="easy">
              <option value="easy">Dễ</option><option value="medium">Trung bình</option>
              <option value="hard">Khó</option><option value="expert">Chuyên gia</option>
            </Select>
          </Field>
          <Field label="Tiêu đề" className="sm:col-span-2">
            <Input name="title" required />
          </Field>
          <Field label="Loại">
            <Select name="kind" defaultValue="quiz">
              <option value="quiz">Quiz trắc nghiệm</option>
              <option value="assignment">Bài tập</option>
              <option value="project">Đồ án</option>
              <option value="exam">Bài thi</option>
              <option value="code">Bài lập trình</option>
            </Select>
          </Field>
          <Field label="Thời gian (phút)">
            <Input name="durationMinutes" type="number" min={1} max={600} defaultValue={60} />
          </Field>
          <Field label="Mở lúc">
            <Input name="opensAt" type="datetime-local" required />
          </Field>
          <Field label="Đóng lúc">
            <Input name="closesAt" type="datetime-local" required />
          </Field>
          <Field label="Hạn hoàn thành chấm điểm" hint="Không bắt buộc; dùng ghi nhận chấm cả lớp đúng hạn.">
            <Input name="gradingDueAt" type="datetime-local" />
          </Field>
          <Field label="Số lần làm tối đa">
            <Input name="maxAttempts" type="number" min={1} max={10} defaultValue={1} />
          </Field>
          <Field label="Hiển thị">
            <label className="flex items-center gap-2 pt-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="published"
                className="h-4 w-4 rounded border-slate-300"
              />
              Công bố ngay
            </label>
          </Field>
          <Field
            label="Danh sách IP / CIDR được phép"
            hint="Không bắt buộc. Mỗi dòng một địa chỉ mạng hoặc ngăn cách bằng dấu phẩy. Để trống để cho phép các IP không bị chặn."
            className="sm:col-span-2"
          >
            <Textarea name="ipAllowlist" placeholder="192.168.1.0/24" />
          </Field>
          <Field label="Mô tả" className="sm:col-span-2">
            <Textarea name="description" placeholder="Hướng dẫn sinh viên" />
          </Field>
        </form>
      </Drawer>
    </div>
  );
}
