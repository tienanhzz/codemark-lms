"use client";
import { confirmInline } from "../InlineConfirm";

import { QRCodeSVG } from "qrcode.react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { AttendanceSession } from "../../lib/types";
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
} from "../ui";
import { isStaff, type CourseTabProps } from "./types";

export function AttendanceTab({ course, role }: CourseTabProps) {
  const staff = isStaff(role);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<number | null>(null);
  const [qrData, setQrData] = useState<AttendanceSession | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [checkInSession, setCheckInSession] = useState<AttendanceSession | null>(null);
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ sessions: AttendanceSession[] }>(
        `/api/courses/${course.id}/attendance-sessions`,
      );
      setSessions(data.sessions);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [course.id]);

  useEffect(() => {
    if (qrSessionId === null) return;
    let active = true;
    async function refresh() {
      try {
        const data = await api<AttendanceSession>(
          `/api/attendance-sessions/${qrSessionId}`,
        );
        if (!active) return;
        setQrData(data);
        setSecondsLeft(30);
      } catch (err) {
        if (active) setError(errorMessage(err));
      }
    }
    refresh();
    const rotate = window.setInterval(refresh, 30000);
    const countdown = window.setInterval(
      () => setSecondsLeft((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => {
      active = false;
      window.clearInterval(rotate);
      window.clearInterval(countdown);
    };
  }, [qrSessionId]);

  async function openSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const created = await api<AttendanceSession>(
        `/api/courses/${course.id}/attendance-sessions`,
        {
          method: "POST",
          body: {
            durationMinutes: Number(form.get("durationMinutes") || 10),
            subnet: form.get("subnet") || "",
          },
        },
      );
      (event.target as HTMLFormElement).reset();
      await load();
      setQrSessionId(created.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function closeSession(session: AttendanceSession) {
    if (!await confirmInline("Đóng phiên điểm danh này?")) return;
    try {
      await api(`/api/attendance-sessions/${session.id}/close`, { method: "POST" });
      if (qrSessionId === session.id) setQrSessionId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function checkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api("/api/attendance/check-in", { method: "POST", body: { token } });
      setNotice("Đã ghi nhận điểm danh.");
      setToken("");
      setCheckInSession(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === qrSessionId) || null,
    [sessions, qrSessionId],
  );

  if (loading) return <Spinner label="Đang tải điểm danh…" />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {staff && (
        <Card title="Bắt đầu điểm danh" subtitle="Mở phiên điểm danh bằng mã QR có thời hạn">
          <form
            onSubmit={openSession}
            className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            <Field label="Thời gian (phút)">
              <Input
                name="durationMinutes"
                type="number"
                min={1}
                max={240}
                defaultValue={10}
              />
            </Field>
            <Field label="Giới hạn mạng con" hint="CIDR không bắt buộc, ví dụ 192.168.1.0/24">
              <Input name="subnet" placeholder="Mọi mạng được phép" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={saving} className="w-full">
                <i className="fa-solid fa-qrcode" /> Mở phiên
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Danh sách điểm danh"
        subtitle={
          staff
            ? "Every session, its lượt points danh and QR rotation"
            : "Check in to open sessions and review your history"
        }
      >
        {sessions.length ? (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-md border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {formatDateTime(session.opensAt)} → {formatDateTime(session.closesAt)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {session.checkedIn} đã điểm danh
                      {session.subnet ? ` · subnet ${session.subnet}` : " · any network"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.active ? (
                      <Badge tone="active">Đang hoạt động</Badge>
                    ) : (
                      <Badge tone="closed">Đã đóng</Badge>
                    )}
                    {staff ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setQrSessionId(session.id)}
                        >
                          <i className="fa-solid fa-qrcode" /> QR
                        </Button>
                        {session.active && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => closeSession(session)}
                          >
                            Đóng
                          </Button>
                        )}
                      </>
                    ) : session.active ? (
                      session.mine ? (
                        <Badge tone="approved">Đã điểm danh</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={async () => {
                            setCheckInSession(session);
                            setToken(session.token || "");
                          }}
                        >
                          <i className="fa-solid fa-check" /> Điểm danh
                        </Button>
                      )
                    ) : (
                      <Badge tone={session.mine ? "approved" : "danger"}>
                        {session.mine ? "Đã points danh" : "Missed"}
                      </Badge>
                    )}
                  </div>
                </div>
                {staff && session.records && session.records.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {session.records.map((record) => (
                      <Badge key={record.id} tone="info">
                        {record.user?.name || "Student"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="fa-qrcode"
            title="Chưa có phiên điểm danh"
            description={
              staff
                ? "Open a session to generate a rotating QR token."
                : "There are no attendance sessions for this course yet."
            }
          />
        )}
      </Card>

      <Drawer
        open={qrSessionId !== null}
        onClose={() => setQrSessionId(null)}
        title="QR điểm danh"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQrSessionId(null)}>
              Đóng
            </Button>
            {activeSession?.active && (
              <Button variant="danger" onClick={() => closeSession(activeSession)}>
                Kết thúc phiên
              </Button>
            )}
          </>
        }
      >
        {qrData ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              {qrData.token ? (
                <QRCodeSVG value={qrData.token} size={220} level="M" />
              ) : (
                <p className="py-16 text-sm text-slate-500">Phiên đã đóng.</p>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Mã sẽ đổi sau{" "}
              <span className="font-bold text-slate-700">{secondsLeft}s</span>. Sinh viên phải đăng nhập và dùng địa chỉ mạng được phép.
            </p>
            {qrData.token && (
              <code className="max-w-full break-all rounded bg-slate-100 p-2 text-[10px] text-slate-600">
                {qrData.token}
              </code>
            )}
            <p className="text-xs text-slate-500">
              {qrData.checkedIn} lượt điểm danh · đóng lúc {formatDateTime(qrData.closesAt)}
            </p>
            {qrData.records && qrData.records.length > 0 && (
              <div className="w-full space-y-1 text-left">
                {qrData.records.map((record) => (
                  <div
                    key={record.id}
                    className="flex justify-between rounded border border-slate-100 px-2 py-1 text-xs"
                  >
                    <span>{record.user?.name}</span>
                    <span className="text-slate-400">
                      {formatDateTime(record.checkedInAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Spinner label="Đang làm mới mã…" />
        )}
      </Drawer>

      <Drawer
        open={checkInSession !== null}
        onClose={() => setCheckInSession(null)}
        title="Điểm danh"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCheckInSession(null)}>
              Hủy
            </Button>
            <Button type="submit" form="checkin-form" loading={saving}>
              <i className="fa-solid fa-check" /> Điểm danh
            </Button>
          </>
        }
      >
        <form id="checkin-form" onSubmit={checkIn} className="space-y-3">
          <Alert tone="info">
            Quét QR của giảng viên hoặc dán mã đi kèm. Mã hết hạn sau 30 giây và không thể dùng lại.
          </Alert>
          <Field label="Mã điểm danh">
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              placeholder="v1.…"
            />
          </Field>
        </form>
      </Drawer>
    </div>
  );
}
