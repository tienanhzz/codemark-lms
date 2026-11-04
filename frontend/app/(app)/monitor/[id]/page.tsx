"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "../../../../lib/realtime";
import { SOCKET_URL, api, download, errorMessage } from "../../../../lib/api";
import { cn, formatDateTime, relativeTime } from "../../../../lib/format";
import type { Assessment, Attempt, ProctorEvent } from "../../../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  StatCard,
  Textarea,
} from "../../../../components/ui";

const VIOLATION_KINDS = new Set([
  "visibility_change",
  "blur",
  "paste",
  "copy",
  "cut",
  "fullscreen_change",
  "connectivity",
]);

export default function MonitorPage() {
  const params = useParams<{ id: string }>();
  const assessmentId = Number(params.id);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const [details, list] = await Promise.all([
        api<Assessment>(`/api/assessments/${assessmentId}`),
        api<{ attempts: Attempt[] }>(`/api/assessments/${assessmentId}/attempts`),
      ]);
      setAssessment(details);
      setAttempts(list.attempts);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("join_monitor", { assessmentId });
      setConnected(true);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("monitor_joined", () => setConnected(true));
    socket.on("monitor_denied", () =>
      setError("You are not authorized to monitor this assessment."),
    );
    socket.on("proctor_event", (event: ProctorEvent) => {
      setEvents((current) => [event, ...current].slice(0, 200));
    });
    socket.on("attempt_submitted", () => {
      load();
    });
    socket.on(
      "teacher_action_ack",
      (payload: { action?: string; ok?: boolean; reason?: string }) => {
        if (payload.ok) setNotice(`Action “${payload.action}” applied.`);
        else setError(`Action failed: ${payload.reason || "unknown"}`);
      },
    );
    const heartbeat = window.setInterval(() => socket.emit("heartbeat"), 30000);
    return () => {
      window.clearInterval(heartbeat);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [assessmentId, load]);

  const selectedAttempt = useMemo(
    () => attempts.find((attempt) => attempt.id === selected) || null,
    [attempts, selected],
  );

  const active = attempts.filter((attempt) => attempt.status === "in_progress");
  const submitted = attempts.filter((attempt) => attempt.status === "submitted");
  const violations = events.filter((event) => VIOLATION_KINDS.has(event.kind));

  function action(
    name: string,
    extra: Record<string, unknown> = {},
    requireTarget = true,
  ) {
    if (!socketRef.current) return;
    if (requireTarget && !selectedAttempt) {
      setError("Select an attempt first.");
      return;
    }
    setError("");
    setNotice("");
    socketRef.current.emit("teacher_action", {
      assessmentId,
      action: name,
      targetUserId: requireTarget ? selectedAttempt?.student?.id : undefined,
      ...extra,
    });
  }

  if (loading) return <Spinner label="Opening monitor…" />;
  if (error && !assessment) return <Alert tone="danger">{error}</Alert>;
  if (!assessment) return null;

  return (
    <div>
      <div className="mb-3">
        <Link
          href={`/assessments/${assessmentId}`}
          className="text-xs font-medium text-slate-500 hover:text-teal-700"
        >
          <i className="fa-solid fa-arrow-left mr-1" /> Back to assessment
        </Link>
      </div>
      <PageHeader
        icon="fa-desktop"
        title={`Monitoring — ${assessment.title}`}
        description="Authenticated telemetry, deadline control and forced submission."
        actions={
          <>
            <Badge tone={connected ? "active" : "danger"}>
              <i className="fa-solid fa-circle text-[6px]" />
              {connected ? "Live" : "Disconnected"}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                download(
                  `/api/courses/${assessment.courseId}/proctor-report`,
                  "proctor-report.csv",
                ).catch((err) => setError(errorMessage(err)))
              }
            >
              <i className="fa-solid fa-download" /> Export violations
            </Button>
          </>
        }
      />

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="fa-user-clock" label="In progress" value={active.length} tone="amber" />
        <StatCard icon="fa-circle-check" label="Submitted" value={submitted.length} tone="emerald" />
        <StatCard icon="fa-triangle-exclamation" label="Telemetry events" value={events.length} tone="rose" />
        <StatCard icon="fa-eye" label="Violation signals" value={violations.length} tone="purple" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Attempts" subtitle="Select an attempt to control it">
          {attempts.length ? (
            <div className="space-y-2">
              {attempts.map((attempt) => {
                const attemptEvents = events.filter(
                  (event) => event.attemptId === attempt.id,
                );
                return (
                  <button
                    key={attempt.id}
                    onClick={() => setSelected(attempt.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition",
                      selected === attempt.id
                        ? "border-teal-400 bg-teal-50"
                        : "border-slate-100 hover:bg-slate-50",
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {attempt.student?.name || `Attempt #${attempt.id}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Q{attempt.currentQuestion ?? "—"} · deadline{" "}
                        {formatDateTime(attempt.deadline)} · {attemptEvents.length} events
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.score !== null && (
                        <span className="text-xs font-semibold text-slate-600">
                          {attempt.score}/{attempt.maxScore}
                        </span>
                      )}
                      <Badge tone={attempt.status === "submitted" ? "approved" : "pending"}>
                        {attempt.status}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="fa-user-clock" title="No attempts yet" />
          )}
        </Card>

        <Card
          title="Exam controls"
          subtitle={
            selectedAttempt
              ? `Target: ${selectedAttempt.student?.name || selectedAttempt.id}`
              : "Select an attempt"
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!selectedAttempt}
                onClick={() => action("adjust_time", { seconds: 300 })}
              >
                <i className="fa-solid fa-plus" /> 5 min
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!selectedAttempt}
                onClick={() => action("adjust_time", { seconds: -300 })}
              >
                <i className="fa-solid fa-minus" /> 5 min
              </Button>
            </div>
            <Button
              size="sm"
              variant="danger"
              className="w-full"
              disabled={!selectedAttempt}
              onClick={() => {
                if (
                  selectedAttempt &&
                  confirm(
                    `Force-submit ${selectedAttempt.student?.name || "this attempt"}?`,
                  )
                ) {
                  action("force_submit");
                }
              }}
            >
              <i className="fa-solid fa-stop" /> Force submit
            </Button>
            <div className="border-t border-slate-100 pt-3">
              <Field label="Broadcast / targeted alert">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-16"
                  placeholder="Stay on the exam page."
                />
              </Field>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  disabled={!message.trim()}
                  onClick={() => {
                    action("alert", { message });
                    setMessage("");
                  }}
                >
                  <i className="fa-solid fa-bullhorn" />
                  {selectedAttempt ? "Send to selected" : "Broadcast"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!message.trim()}
                  onClick={() => {
                    action("alert", { message }, false);
                    setMessage("");
                  }}
                >
                  Send to all
                </Button>
              </div>
            </div>
            {!connected && (
              <Alert tone="warning">
                Socket is disconnected. Reconnecting automatically; controls are disabled
                until the live channel is restored.
              </Alert>
            )}
          </div>
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Live telemetry"
        subtitle="Newest events first. Copy, paste, tab and focus signals are persisted."
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEvents([])}>
            Clear view
          </Button>
        }
      >
        {events.length ? (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {events.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  VIOLATION_KINDS.has(event.kind)
                    ? "border-rose-100 bg-rose-50"
                    : "border-slate-100",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-700">
                    {event.kind.replaceAll("_", " ")}
                    <span className="ml-2 font-normal text-slate-400">
                      attempt #{event.attemptId}
                    </span>
                  </p>
                  <span className="text-slate-400">{relativeTime(event.createdAt)}</span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap text-[11px] text-slate-500">
                  {JSON.stringify(event.detail)}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="fa-satellite-dish"
            title="Waiting for telemetry"
            description="Focus, fullscreen, visibility, clipboard and connectivity events appear here in real time."
          />
        )}
      </Card>
    </div>
  );
}
