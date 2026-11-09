"use client";
import { confirmInline } from "../../../../components/InlineConfirm";

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
      setError("Bạn không có quyền giám sát bài kiểm tra này."),
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
        if (payload.ok) setNotice(`Đã thực hiện thao tác “${payload.action}”.`);
        else setError(`Thao tác thất bại: ${payload.reason || "chưa rõ nguyên nhân"}`);
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
      setError("Hãy chọn một lượt làm trước.");
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

  if (loading) return <Spinner label="Đang mở giám sát…" />;
  if (error && !assessment) return <Alert tone="danger">{error}</Alert>;
  if (!assessment) return null;

  return (
    <div>
      <div className="mb-3">
        <Link
          href={`/assessments/${assessmentId}`}
          className="text-xs font-medium text-slate-500 hover:text-teal-700"
        >
          <i className="fa-solid fa-arrow-left mr-1" /> Quay lại bài kiểm tra
        </Link>
      </div>
      <PageHeader
        icon="fa-desktop"
        title={`Monitoring — ${assessment.title}`}
        description="Theo dõi hoạt động, điều chỉnh thời gian và buộc nộp bài."
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
              <i className="fa-solid fa-download" /> Xuất vi phạm
            </Button>
          </>
        }
      />

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="fa-user-clock" label="Đang làm" value={active.length} tone="amber" />
        <StatCard icon="fa-circle-check" label="Đã nộp" value={submitted.length} tone="emerald" />
        <StatCard icon="fa-triangle-exclamation" label="Sự kiện giám sát" value={events.length} tone="rose" />
        <StatCard icon="fa-eye" label="Dấu hiệu vi phạm" value={violations.length} tone="purple" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Lượt làm bài" subtitle="Chọn lượt làm để thao tác">
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
                        {attempt.student?.name || `Lượt làm #${attempt.id}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Q{attempt.currentQuestion ?? "—"} · hạn nộp{" "}
                        {formatDateTime(attempt.deadline)} · {attemptEvents.length} sự kiện
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
            <EmptyState icon="fa-user-clock" title="Chưa có lượt làm bài" />
          )}
        </Card>

        <Card
          title="Điều khiển bài thi"
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
                <i className="fa-solid fa-plus" /> 5 phút
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!selectedAttempt}
                onClick={() => action("adjust_time", { seconds: -300 })}
              >
                <i className="fa-solid fa-minus" /> 5 phút
              </Button>
            </div>
            <Button
              size="sm"
              variant="danger"
              className="w-full"
              disabled={!selectedAttempt}
              onClick={async () => {
                if (
                  selectedAttempt &&
                  await confirmInline(
                    `Force-submit ${selectedAttempt.student?.name || "this attempt"}?`,
                  )
                ) {
                  action("force_submit");
                }
              }}
            >
              <i className="fa-solid fa-stop" /> Buộc nộp bài
            </Button>
            <div className="border-t border-slate-100 pt-3">
              <Field label="Thông báo chung / cá nhân">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-16"
                  placeholder="Vui lòng ở lại trang làm bài."
                />
              </Field>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  disabled={!message.trim()}
                  onClick={async () => {
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
                  onClick={async () => {
                    action("alert", { message }, false);
                    setMessage("");
                  }}
                >
                  Gửi cho tất cả
                </Button>
              </div>
            </div>
            {!connected && (
              <Alert tone="warning">
                Mất kết nối trực tiếp. Hệ thống đang kết nối lại; thao tác tạm khóa.
              </Alert>
            )}
          </div>
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Giám sát trực tiếp"
        subtitle="Sự kiện mới nhất ở trên. Các thao tác sao chép, dán, chuyển tab và mất tập trung được lưu."
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEvents([])}>
            Xóa nội dung hiển thị
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
                      lượt làm #{event.attemptId}
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
            title="Đang chờ sự kiện"
            description="Sự kiện tập trung, toàn màn hình, chuyển tab, sao chép và kết nối xuất hiện trực tiếp tại đây."
          />
        )}
      </Card>
    </div>
  );
}
