"use client";

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
  Modal,
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
    if (!confirm("Close this attendance session?")) return;
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
      setNotice("Attendance recorded.");
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

  if (loading) return <Spinner label="Loading attendance…" />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {staff && (
        <Card title="Start attendance" subtitle="Open a short-lived QR check-in window">
          <form
            onSubmit={openSession}
            className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            <Field label="Duration (minutes)">
              <Input
                name="durationMinutes"
                type="number"
                min={1}
                max={240}
                defaultValue={10}
              />
            </Field>
            <Field label="Subnet restriction" hint="Optional CIDR, e.g. 192.168.1.0/24">
              <Input name="subnet" placeholder="Any trusted network" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={saving} className="w-full">
                <i className="fa-solid fa-qrcode" /> Open session
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Attendance records"
        subtitle={
          staff
            ? "Every session, its check-ins and QR rotation"
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
                      {session.checkedIn} checked in
                      {session.subnet ? ` · subnet ${session.subnet}` : " · any network"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.active ? (
                      <Badge tone="active">Active</Badge>
                    ) : (
                      <Badge tone="closed">Closed</Badge>
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
                            Close
                          </Button>
                        )}
                      </>
                    ) : session.active ? (
                      session.mine ? (
                        <Badge tone="approved">Checked in</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setCheckInSession(session);
                            setToken(session.token || "");
                          }}
                        >
                          <i className="fa-solid fa-check" /> Check in
                        </Button>
                      )
                    ) : (
                      <Badge tone={session.mine ? "approved" : "danger"}>
                        {session.mine ? "Checked in" : "Missed"}
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
            title="No attendance sessions"
            description={
              staff
                ? "Open a session to generate a rotating QR token."
                : "There are no attendance sessions for this course yet."
            }
          />
        )}
      </Card>

      <Modal
        open={qrSessionId !== null}
        onClose={() => setQrSessionId(null)}
        title="Attendance QR"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQrSessionId(null)}>
              Close
            </Button>
            {activeSession?.active && (
              <Button variant="danger" onClick={() => closeSession(activeSession)}>
                End session
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
                <p className="py-16 text-sm text-slate-500">Session is closed.</p>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Token rotates in{" "}
              <span className="font-bold text-slate-700">{secondsLeft}s</span>. Students
              must be signed in and match the network rule.
            </p>
            {qrData.token && (
              <code className="max-w-full break-all rounded bg-slate-100 p-2 text-[10px] text-slate-600">
                {qrData.token}
              </code>
            )}
            <p className="text-xs text-slate-500">
              {qrData.checkedIn} check-ins · closes {formatDateTime(qrData.closesAt)}
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
          <Spinner label="Refreshing token…" />
        )}
      </Modal>

      <Modal
        open={checkInSession !== null}
        onClose={() => setCheckInSession(null)}
        title="Attendance check-in"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCheckInSession(null)}>
              Cancel
            </Button>
            <Button type="submit" form="checkin-form" loading={saving}>
              <i className="fa-solid fa-check" /> Check in
            </Button>
          </>
        }
      >
        <form id="checkin-form" onSubmit={checkIn} className="space-y-3">
          <Alert tone="info">
            Scan the teacher&apos;s QR code or paste the token shown with it. Tokens expire
            after 30 seconds and cannot be reused.
          </Alert>
          <Field label="Attendance token">
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              placeholder="v1.…"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
