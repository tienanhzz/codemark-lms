"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import type { Dashboard } from "../../../lib/types";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "../../../components/ui";

export default function AttendancePage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  async function loadDashboard() {
    try {
      setDashboard(await api<Dashboard>("/api/dashboard"));
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function checkIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/attendance/check-in", { method: "POST", body: { token } });
      setSuccess("Đã ghi nhận points danh. Keep this page open in case you need to check another session.");
      setToken("");
      await loadDashboard();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon="fa-qrcode"
        title="Điểm danh"
        description="Quét mã QR của giảng viên hoặc dán mã điểm danh hiển thị bên cạnh."
      />
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {success && <Alert tone="success" className="mb-3">{success}</Alert>}

      <Card title="Nhập mã điểm danh" subtitle="Mã hết hạn sau 30 giây và không thể dùng lại">
        <form onSubmit={checkIn} className="space-y-3">
          <Field label="Mã điểm danh">
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              placeholder="v1.…"
              className="font-mono text-xs"
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            <i className="fa-solid fa-check-to-slot" /> Điểm danh
          </Button>
        </form>
      </Card>

      <Card
        className="mt-4"
        title="Mở phiên"
        subtitle="Các phiên đang nhận điểm danh trong lớp của bạn"
      >
        {!dashboard ? (
          <Spinner label="Đang tải phiên…" />
        ) : dashboard.openAttendance.length ? (
          <div className="space-y-2">
            {dashboard.openAttendance.map((session) => {
              const course = dashboard.courses.find(
                (item) => item.id === session.courseId,
              );
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-700">
                      {course?.code} — {course?.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      Đóng lúc {formatDateTime(session.closesAt)}
                    </p>
                  </div>
                  <Link
                    href={`/courses/${session.courseId}`}
                    className="text-xs font-semibold text-teal-700"
                  >
                    Mở lớp học
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">
            Hiện chưa có phiên điểm danh nào mở.
          </p>
        )}
      </Card>
    </div>
  );
}
