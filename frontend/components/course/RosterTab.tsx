"use client";
import { useI18n } from "../LanguageProvider";

import { confirmInline } from "../InlineConfirm";

import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { roleLabel } from "../../lib/format";
import type { RosterEntry } from "../../lib/types";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from "../ui";
import { type CourseTabProps } from "./types";

export function RosterTab({ course }: CourseTabProps) {
  const { tr, language } = useI18n();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ roster: RosterEntry[] }>(
        `/api/courses/${course.id}/roster`,
      );
      setRoster(data.roster);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [course.id]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/courses/${course.id}/roster`, {
        method: "POST",
        body: {
          studentId: form.get("studentId"),
          courseRole: form.get("courseRole"),
        },
      });
      (event.target as HTMLFormElement).reset();
      setNotice("Đã thêm thành viên vào lớp.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(entry: RosterEntry, courseRole: string) {
    try {
      await api(`/api/courses/${course.id}/roster/${entry.user.id}`, {
        method: "PATCH",
        body: { courseRole },
      });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(entry: RosterEntry) {
    if (!await confirmInline(`Remove ${entry.user.name} from ${course.code}?`)) return;
    try {
      await api(`/api/courses/${course.id}/roster/${entry.user.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <Spinner label={tr("Đang tải danh sách thành viên…")} />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card title={tr("Thêm thành viên")} subtitle={tr("Nhập chính xác mã đăng nhập 10 số")}>
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
          <Field label={tr("Mã đăng nhập")}>
            <Input name="studentId" type="text" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="2025000001" />
          </Field>
          <Field label={tr("Vai trò trong lớp")}>
            <Select name="courseRole" defaultValue="student">
              <option value="student">{tr("Sinh viên")}</option>
              <option value="ta">{tr("Trợ giảng")}</option>
              <option value="teacher">{tr("Giảng viên")}</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={saving} className="w-full">
              <i className="fa-solid fa-user-plus" />{" " + tr("Thêm thành viên")}</Button>
          </div>
        </form>
      </Card>

      <Card title={tr("Danh sách thành viên lớp")} subtitle={tr("{0} members", { 0: (roster.length) })}>
        {roster.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2">{tr("Thành viên")}</th>
                  <th className="py-2">{tr("Vai trò tài khoản")}</th>
                  <th className="py-2">{tr("Vai trò trong lớp")}</th>
                  <th className="py-2 text-right">{tr("Thao tác")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {roster.map((entry) => (
                  <tr key={entry.enrollmentId}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={entry.user.name} role={entry.user.role} />
                        <div>
                          <p className="font-medium text-slate-700">{entry.user.name}</p>
                          <p className="text-xs text-slate-400">{entry.user.studentId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge tone={entry.user.role}>{roleLabel(entry.user.role, language)}</Badge>
                    </td>
                    <td className="py-2">
                      {entry.user.id === course.ownerId ? (
                        <Badge tone="teacher">{tr("Phụ trách")}</Badge>
                      ) : (
                        <Select
                          value={entry.courseRole}
                          onChange={(event) => changeRole(entry, event.target.value)}
                          className="w-36 py-1 text-xs"
                        >
                          <option value="student">{tr("Sinh viên")}</option>
                          <option value="ta">{tr("TA")}</option>
                          <option value="teacher">{tr("Giảng viên")}</option>
                        </Select>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {entry.user.id !== course.ownerId && (
                        <Button size="sm" variant="ghost" onClick={() => remove(entry)}>
                          <i className="fa-solid fa-user-minus text-rose-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="fa-users" title={tr("Chưa có thành viên")} />
        )}
      </Card>
    </div>
  );
}
