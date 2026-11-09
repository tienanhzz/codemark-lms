"use client";
import { confirmInline } from "../../../../components/InlineConfirm";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "../../../../lib/realtime";
import { SOCKET_URL, api, errorMessage } from "../../../../lib/api";
import { cn, countdown, formatDateTime } from "../../../../lib/format";
import type { Attempt, Question } from "../../../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  Spinner,
  Textarea,
} from "../../../../components/ui";

type RunResult = {
  testCaseId: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
};

export default function AttemptPage() {
  const params = useParams<{ id: string }>();
  const attemptId = Number(params.id);
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flagSaving, setFlagSaving] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const offsetRef = useRef(0);
  const indexRef = useRef(0);
  const tabSwitchesRef = useRef(0);
  const timersRef = useRef<Record<number, number>>({});
  const submittedRef = useRef(false);
  const pendingSavesRef = useRef<Promise<unknown>[]>([]);
  const answersRef = useRef<Record<string, string>>({});
  answersRef.current = answers;

  const load = useCallback(async () => {
    try {
      const data = await api<Attempt>(`/api/attempts/${attemptId}`);
      setAttempt(data);
      setAnswers(
        Object.fromEntries(
          Object.entries(data.answers || {}).map(([key, value]) => [
            key,
            value ?? "",
          ]),
        ),
      );
      offsetRef.current = data.serverTime
        ? new Date(data.serverTime).getTime() - Date.now()
        : 0;
      if (data.currentQuestion && data.questions) {
        const found = data.questions.findIndex(
          (question) => question.id === data.currentQuestion,
        );
        if (found >= 0) {
          setIndex(found);
          indexRef.current = found;
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const questions = attempt?.questions || [];
  const question: Question | undefined = questions[index];

  const sendTelemetry = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      if (!attempt) return;
      const payload = {
        attemptId: attempt.id,
        event,
        question: questions[indexRef.current]?.id,
        fullscreen: Boolean(document.fullscreenElement),
        visible: !document.hidden,
        tabSwitches: tabSwitchesRef.current,
        connectivity: navigator.onLine ? "online" : "offline",
        ...extra,
      };
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("telemetry", payload);
      } else {
        api(`/api/attempts/${attempt.id}/telemetry`, {
          method: "POST",
          body: payload,
        }).catch(() => undefined);
      }
    },
    [attempt?.id, questions],
  );

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const socket = io(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;

    const onVisibility = () => {
      if (document.hidden) tabSwitchesRef.current += 1;
      sendTelemetry("visibility_change", { tabSwitches: tabSwitchesRef.current });
    };
    const onFocus = () => sendTelemetry("focus");
    const onBlur = () => sendTelemetry("blur");
    const onFullscreen = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      sendTelemetry("fullscreen_change", {
        fullscreen: Boolean(document.fullscreenElement),
      });
    };
    const onCopy = () => sendTelemetry("copy");
    const onCut = () => sendTelemetry("cut");
    const onPaste = () => sendTelemetry("paste");
    const onOnline = () => sendTelemetry("connectivity", { connectivity: "online" });
    const onOffline = () => sendTelemetry("connectivity", { connectivity: "offline" });

    socket.on("connect", () => {
      socket.emit("heartbeat");
      sendTelemetry("connected");
    });
    socket.on("teacher_alert", (payload: { message?: string; from?: string }) => {
      setAlertMessage(
        `${payload.from || "Teacher"}: ${payload.message || "Please stay focused."}`,
      );
    });
    socket.on(
      "deadline_adjusted",
      (payload: { deadline?: string; seconds?: number }) => {
        if (!payload.deadline) return;
        setAttempt((current) =>
          current ? { ...current, deadline: payload.deadline as string } : current,
        );
        setNotice(
          `The teacher adjusted your deadline (${payload.seconds ?? 0}s). New deadline: ${formatDateTime(
            payload.deadline,
          )}.`,
        );
      },
    );
    socket.on("forced_submission", () => {
      setAlertMessage("The teacher submitted your attempt.");
      submittedRef.current = true;
      load();
    });

    const heartbeat = window.setInterval(() => {
      socket.emit("heartbeat");
      api("/api/auth/heartbeat", { method: "POST" }).catch(() => undefined);
    }, 30000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [attempt?.id, attempt?.status, load, sendTelemetry]);

  useEffect(() => {
    indexRef.current = index;
    if (attempt?.status === "in_progress") {
      sendTelemetry("question_progress");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const serverNow = nowTick + offsetRef.current;
  const timer = useMemo(
    () => (attempt ? countdown(attempt.deadline, serverNow) : null),
    [attempt?.deadline, serverNow],
  );

  const submit = useCallback(
    async (automatic = false) => {
      if (!attempt || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setError("");
      try {
        Object.values(timersRef.current).forEach(window.clearTimeout);
        await Promise.all(pendingSavesRef.current);
        await Promise.all(Object.entries(answersRef.current).map(([id, response]) =>
          api(`/api/attempts/${attempt.id}/answers/${id}`, {
            method: "PUT", body: { response },
          }),
        ));
        await api(`/api/attempts/${attempt.id}/submit`, { method: "POST" });
        if (automatic) setNotice("Hết giờ, bài làm đã được nộp tự động.");
        await load();
      } catch (err) {
        submittedRef.current = false;
        setError(
          errorMessage(err) === "deadline exceeded"
            ? "The server deadline has passed. Submission was rejected; contact your teacher."
            : errorMessage(err),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [attempt?.id, load],
  );

  useEffect(() => {
    if (
      attempt?.status === "in_progress" &&
      timer &&
      timer.total <= 2 &&
      timer.total > -10 &&
      !submittedRef.current
    ) {
      submit(true);
    }
  }, [timer?.total, attempt?.status, submit]);

  function persist(questionId: number, value: string) {
    window.clearTimeout(timersRef.current[questionId]);
    timersRef.current[questionId] = window.setTimeout(async () => {
      try {
        const saving = api(`/api/attempts/${attemptId}/answers/${questionId}`, {
          method: "PUT",
          body: { response: value, currentQuestion: questionId },
        });
        pendingSavesRef.current.push(saving.catch(() => undefined));
        await saving;
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 600);
  }

  function updateAnswer(questionId: number, value: string) {
    setAnswers((current) => ({ ...current, [String(questionId)]: value }));
    persist(questionId, value);
  }

  async function runSample() {
    if (!question) return;
    setRunning(true);
    setRunResults(null);
    setError("");
    try {
      const data = await api<{ results: RunResult[]; note?: string }>(
        `/api/questions/${question.id}/run`,
        { method: "POST", body: { source: answers[String(question.id)] || "" } },
      );
      setRunResults(data.results);
      if (data.note) setNotice(data.note.replaceAll("_", " "));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function toggleFlag(questionId: number) {
    if (!attempt || flagSaving) return;
    setFlagSaving(true);
    try {
      const result = await api<{ flaggedQuestions: number[] }>(
        `/api/attempts/${attempt.id}/flags/${questionId}`, {
          method: "PUT",
          body: { flagged: !(attempt.flaggedQuestions || []).includes(questionId) },
        },
      );
      setAttempt((current) => current ? { ...current, flaggedQuestions: result.flaggedQuestions } : current);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFlagSaving(false);
    }
  }

  if (loading) return <Spinner label="Đang tải lượt làm…" />;
  if (error && !attempt) return <Alert tone="danger">{error}</Alert>;
  if (!attempt) return null;

  if (attempt.status === "submitted") {
    return (
      <div className="mx-auto max-w-xl">
        <Card title="Đã nộp bài" subtitle={`Submitted ${formatDateTime(attempt.submittedAt)}`}>
          <div className="text-center">
            <p className="text-4xl font-bold text-slate-800">
              {attempt.score ?? 0}
              <span className="text-lg text-slate-400"> / {attempt.maxScore}</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Bài được chấm trên máy chủ. Câu lập trình có thể cần thêm thời gian xử lý.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link
                href={`/assessments/${attempt.assessmentId}`}
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white"
              >
                Quay lại bài kiểm tra
              </Link>
              <Link
                href={`/courses/${attempt.assessment?.courseId || ""}`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                Quay lại lớp học
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const answeredCount = questions.filter(
    (item) => (answers[String(item.id)] || "").trim().length > 0,
  ).length;
  const expired = timer?.expired ?? false;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {attempt.assessment?.title || "Assessment attempt"}
          </p>
          <p className="text-xs text-slate-500">
            Hạn nộp {formatDateTime(attempt.deadline)} · {answeredCount}/
            {questions.length} đã trả lời · {attempt.flaggedQuestions?.length || 0} đã đánh dấu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md px-3 py-1.5 font-mono text-lg font-bold",
              (timer?.total ?? 0) < 120
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-100 text-slate-700",
            )}
          >
            <i className="fa-regular fa-clock mr-2 text-sm" />
            {timer?.label || "00:00:00"}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen().catch(() => undefined)
            }
          >
            <i className={cn("fa-solid", fullscreen ? "fa-compress" : "fa-expand")} />
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
          <Button
            size="sm"
            variant="success"
            loading={submitting}
            disabled={expired}
            onClick={async () => {
              if (await confirmInline("Nộp bài này? Sau khi nộp bạn không thể thay đổi đáp án.")) {
                submit(false);
              }
            }}
          >
            <i className="fa-solid fa-paper-plane" /> Nộp
          </Button>
        </div>
      </div>

      {alertMessage && (
        <Alert tone="warning" className="mb-3">
          <div className="flex items-start justify-between gap-3">
            <span>
              <i className="fa-solid fa-bullhorn mr-2" />
              {alertMessage}
            </span>
            <button onClick={() => setAlertMessage("")} className="text-xs underline">
              Ẩn thông báo
            </button>
          </div>
        </Alert>
      )}
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="info" className="mb-3">{notice}</Alert>}
      {expired && (
        <Alert tone="danger" className="mb-3">
          Đã quá hạn trên máy chủ. Giảng viên có thể buộc nộp bài.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card title="Câu hỏi" bodyClassName="p-2">
          <div className="grid grid-cols-5 gap-1 lg:grid-cols-4">
            {questions.map((item, itemIndex) => {
              const answered = (answers[String(item.id)] || "").trim().length > 0;
              return (
                <button
                  key={item.id}
                  aria-label={`Question ${itemIndex + 1}${attempt.flaggedQuestions?.includes(item.id) ? ", flagged for review" : ""}`}
                  onClick={async () => {
                    setIndex(itemIndex);
                    setRunResults(null);
                  }}
                  className={cn(
                    "rounded-md border py-2 text-xs font-semibold transition",
                    itemIndex === index
                      ? "border-teal-600 bg-teal-600 text-white"
                      : answered
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-teal-300",
                  )}
                >
                  {itemIndex + 1}
                  {attempt.flaggedQuestions?.includes(item.id) && <i className="fa-solid fa-flag ml-1 text-amber-500" />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-100 p-2 text-[11px] text-slate-500">
            <p><i className="fa-solid fa-flag mr-1 text-amber-500" /> Đánh dấu để xem lại (không ảnh hưởng điểm)</p>
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Đã trả lời
            </p>
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />
              Chưa trả lời
            </p>
          </div>
        </Card>

        <Card
          title={`Question ${index + 1} of ${questions.length}`}
          subtitle={`${question?.points ?? 0} điểm · ${question?.kind || ""}${
            question?.language ? ` · ${question.language}` : ""
          }`}
        >
          {question ? (
            <div className="space-y-4">
              <Button variant="secondary" size="sm" loading={flagSaving}
                disabled={expired || submitting} aria-pressed={attempt.flaggedQuestions?.includes(question.id) || false}
                onClick={() => toggleFlag(question.id)}>
                <i className="fa-solid fa-flag text-amber-500" />
                {attempt.flaggedQuestions?.includes(question.id) ? "Remove flag / Bỏ cờ" : "Flag for review / Gắn cờ"}
              </Button>
              <p className="prose-lesson text-sm text-slate-700">{question.prompt}</p>

              {question.kind === "mcq" && (
                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        String(optionIndex) === answers[String(question.id)]
                          ? "border-teal-400 bg-teal-50"
                          : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        checked={String(optionIndex) === answers[String(question.id)]}
                        onChange={() =>
                          updateAnswer(question.id, String(optionIndex))
                        }
                      />
                      <span className="font-semibold text-slate-500">
                        {String.fromCharCode(65 + optionIndex)}.
                      </span>
                      {option}
                    </label>
                  ))}
                </div>
              )}

              {question.kind === "short" && (
                <Textarea
                  value={answers[String(question.id)] || ""}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                  placeholder="Câu trả lời của bạn…"
                />
              )}

              {question.kind === "code" && (
                <div className="space-y-2">
                  <Textarea
                    value={answers[String(question.id)] || ""}
                    onChange={(event) => updateAnswer(question.id, event.target.value)}
                    className="min-h-64 font-mono text-xs"
                    placeholder={`Write your ${question.language || "code"} solution…`}
                    spellCheck={false}
                  />
                  {question.testCases && question.testCases.length > 0 && (
                    <div className="space-y-1 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
                      <p className="font-semibold text-slate-600">Bộ kiểm thử công khai</p>
                      {question.testCases.map((testCase, caseIndex) => (
                        <div key={caseIndex} className="rounded bg-white p-2">
                          <p className="text-slate-500">Đầu vào:</p>
                          <pre className="whitespace-pre-wrap">{testCase.input || "(empty)"}</pre>
                          <p className="text-slate-500">Kết quả mong đợi:</p>
                          <pre className="whitespace-pre-wrap">
                            {testCase.expectedOutput}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={running}
                    onClick={runSample}
                  >
                    <i className="fa-solid fa-play" /> Chạy thử mẫu công khai
                  </Button>
                  {runResults && (
                    <div className="space-y-1">
                      {runResults.length === 0 && (
                        <Alert tone="info">Câu hỏi này chưa có bộ kiểm thử công khai.</Alert>
                      )}
                      {runResults.map((result) => (
                        <Alert
                          key={result.testCaseId}
                          tone={result.passed ? "success" : "danger"}
                        >
                          Bộ kiểm thử #{result.testCaseId}:{" "}
                          {result.passed ? "passed" : result.error || "failed"}
                          {!result.passed && result.stderr && (
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs">
                              {result.stderr}
                            </pre>
                          )}
                        </Alert>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <Button
                  variant="secondary"
                  disabled={index === 0}
                  onClick={async () => {
                    setIndex((value) => Math.max(0, value - 1));
                    setRunResults(null);
                  }}
                >
                  <i className="fa-solid fa-arrow-left" /> Trước
                </Button>
                {index < questions.length - 1 ? (
                  <Button
                    onClick={async () => {
                      setIndex((value) => Math.min(questions.length - 1, value + 1));
                      setRunResults(null);
                    }}
                  >
                    Tiếp <i className="fa-solid fa-arrow-right" />
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    loading={submitting}
                    disabled={expired}
                    onClick={async () => {
                      if (await confirmInline("Nộp bài này?")) submit(false);
                    }}
                  >
                    <i className="fa-solid fa-paper-plane" /> Nộp bài
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Alert tone="info">Bài kiểm tra này chưa có câu hỏi.</Alert>
          )}
        </Card>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="ghost"
          onClick={async () => {
            if (await confirmInline("Rời trang này? Các đáp án đã lưu vẫn được giữ trên máy chủ.")) {
              router.push(`/assessments/${attempt.assessmentId}`);
            }
          }}
        >
          Rời bài làm
        </Button>
      </div>
    </div>
  );
}
