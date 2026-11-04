"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, download, errorMessage } from "../../../../lib/api";
import { formatDateTime } from "../../../../lib/format";
import type {
  Assessment,
  Attempt,
  Question,
  TestCase,
} from "../../../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "../../../../components/ui";
import { isStaff } from "../../../../components/course/types";

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function AssessmentPage() {
  const params = useParams<{ id: string }>();
  const assessmentId = Number(params.id);
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [casesQuestion, setCasesQuestion] = useState<Question | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [caseLoading, setCaseLoading] = useState(false);

  const staff = isStaff(assessment?.role);

  const load = useCallback(async () => {
    try {
      const data = await api<Assessment>(`/api/assessments/${assessmentId}`);
      setAssessment(data);
      if (isStaff(data.role)) {
        const list = await api<{ attempts: Attempt[] }>(
          `/api/assessments/${assessmentId}/attempts`,
        );
        setAttempts(list.attempts);
      } else {
        const mine = await api<{ attempts: Attempt[] }>("/api/attempts");
        setAttempts(
          mine.attempts.filter((attempt) => attempt.assessmentId === assessmentId),
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const submitted = attempts.filter((attempt) => attempt.status === "submitted");
    const best = submitted.length
      ? Math.max(...submitted.map((attempt) => attempt.score || 0))
      : null;
    const inProgress = attempts.find((attempt) => attempt.status === "in_progress");
    return { submitted, best, inProgress };
  }, [attempts]);

  async function togglePublish() {
    if (!assessment) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/assessments/${assessmentId}`, {
        method: "PATCH",
        body: { published: !assessment.published },
      });
      setNotice(assessment.published ? "Assessment unpublished." : "Assessment published.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const allowlist = String(form.get("ipAllowlist") || "")
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      await api(`/api/assessments/${assessmentId}`, {
        method: "PATCH",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          opensAt: new Date(String(form.get("opensAt"))).toISOString(),
          closesAt: new Date(String(form.get("closesAt"))).toISOString(),
          durationMinutes: Number(form.get("durationMinutes")),
          maxAttempts: Number(form.get("maxAttempts")),
          ipAllowlist: allowlist,
        },
      });
      setEditOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind"));
    const options = String(form.get("options") || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setSaving(true);
    setError("");
    try {
      const body = {
        prompt: form.get("prompt"),
        kind,
        language: kind === "code" ? form.get("language") : null,
        options: kind === "mcq" ? options : [],
        answer: form.get("answer"),
        points: Number(form.get("points") || 1),
        position: Number(form.get("position") || 0),
      };
      if (editingQuestion) {
        await api(`/api/questions/${editingQuestion.id}`, { method: "PATCH", body });
      } else {
        await api(`/api/assessments/${assessmentId}/questions`, {
          method: "POST",
          body,
        });
      }
      setQuestionOpen(false);
      setEditingQuestion(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(question: Question) {
    if (!confirm("Delete this question and its test cases?")) return;
    try {
      await api(`/api/questions/${question.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function openCases(question: Question) {
    setCasesQuestion(question);
    setCaseLoading(true);
    try {
      const data = await api<{ testCases: TestCase[] }>(
        `/api/questions/${question.id}/testcases`,
      );
      setCases(data.testCases);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCaseLoading(false);
    }
  }

  async function addCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!casesQuestion) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(`/api/questions/${casesQuestion.id}/testcases`, {
        method: "POST",
        body: {
          input: form.get("input"),
          expectedOutput: form.get("expectedOutput"),
          hidden: form.get("hidden") === "on",
          points: Number(form.get("points") || 1),
          timeLimitMs: Number(form.get("timeLimitMs") || 2000),
          memoryMb: Number(form.get("memoryMb") || 256),
        },
      });
      (event.target as HTMLFormElement).reset();
      await openCases(casesQuestion);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCase(caseId?: number) {
    if (!caseId || !casesQuestion) return;
    try {
      await api(`/api/testcases/${caseId}`, { method: "DELETE" });
      await openCases(casesQuestion);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function startAttempt() {
    setSaving(true);
    setError("");
    try {
      const attempt = await api<Attempt>(`/api/assessments/${assessmentId}/start`, {
        method: "POST",
      });
      router.push(`/attempts/${attempt.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading assessment…" />;
  if (error && !assessment) return <Alert tone="danger">{error}</Alert>;
  if (!assessment) return null;

  return (
    <div>
      <div className="mb-3">
        <Link
          href={`/courses/${assessment.courseId}`}
          className="text-xs font-medium text-slate-500 hover:text-teal-700"
        >
          <i className="fa-solid fa-arrow-left mr-1" /> Back to course
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{assessment.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {assessment.kind} · opens {formatDateTime(assessment.opensAt)} · closes{" "}
            {formatDateTime(assessment.closesAt)} · {assessment.durationMinutes} min ·{" "}
            {assessment.maxAttempts} attempt(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assessment.published ? (
            <Badge tone="published">Published</Badge>
          ) : (
            <Badge tone="draft">Draft</Badge>
          )}
          {staff ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <i className="fa-solid fa-pen" /> Edit
              </Button>
              <Button
                variant={assessment.published ? "secondary" : "success"}
                size="sm"
                loading={saving}
                onClick={togglePublish}
              >
                {assessment.published ? "Unpublish" : "Publish"}
              </Button>
              <Link
                href={`/monitor/${assessment.id}`}
                className="inline-flex items-center gap-2 rounded-md border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
              >
                <i className="fa-solid fa-desktop" /> Monitor
              </Link>
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
                <i className="fa-solid fa-download" /> Proctor CSV
              </Button>
            </>
          ) : (
            <Button
              loading={saving}
              disabled={!counts.inProgress && counts.submitted.length >= assessment.maxAttempts}
              onClick={startAttempt}
            >
              <i className="fa-solid fa-play" />
              {counts.inProgress
                ? "Resume attempt"
                : counts.submitted.length >= assessment.maxAttempts
                  ? "Attempts used"
                  : "Start attempt"}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      {assessment.description && (
        <Card className="mb-4" title="Instructions">
          <p className="prose-lesson text-sm text-slate-600">{assessment.description}</p>
        </Card>
      )}

      {!staff && (
        <Card
          className="mb-4"
          title="Your attempts"
          subtitle={`Best score: ${counts.best ?? "—"}`}
        >
          {attempts.length ? (
            <div className="space-y-2">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-700">
                      Attempt #{attempt.id} · {attempt.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      Started {formatDateTime(attempt.startedAt)} · deadline{" "}
                      {formatDateTime(attempt.deadline)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={attempt.status === "submitted" ? "approved" : "pending"}>
                      {attempt.score !== null
                        ? `${attempt.score} / ${attempt.maxScore}`
                        : attempt.status}
                    </Badge>
                    {attempt.status === "in_progress" && (
                      <Link
                        href={`/attempts/${attempt.id}`}
                        className="rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-medium text-white"
                      >
                        Resume
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="fa-file-circle-plus" title="No attempts yet" />
          )}
        </Card>
      )}

      {staff && (
        <Card
          className="mb-4"
          title="Questions"
          subtitle={`${assessment.questions?.length || 0} questions · answers and hidden cases are staff-only`}
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  setEditingQuestion(null);
                  setQuestionOpen(true);
                }}
              >
                <i className="fa-solid fa-plus" /> Question
              </Button>
              <Link
                href={`/monitor/${assessment.id}`}
                className="text-xs font-semibold text-teal-700"
              >
                Open monitor
              </Link>
            </>
          }
        >
          {assessment.questions?.length ? (
            <div className="space-y-3">
              {assessment.questions.map((question, index) => (
                <article
                  key={question.id}
                  className="rounded-md border border-slate-100 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {index + 1}. {question.prompt}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        <Badge tone="info">{question.kind}</Badge>
                        {question.language ? ` · ${question.language}` : ""} ·{" "}
                        {question.points} points
                        {question.kind === "code"
                          ? ` · ${question.testCaseCount} test case(s)`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {question.kind === "code" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openCases(question)}
                        >
                          <i className="fa-solid fa-vial" /> Tests
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingQuestion(question);
                          setQuestionOpen(true);
                        }}
                      >
                        <i className="fa-solid fa-pen" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteQuestion(question)}
                      >
                        <i className="fa-solid fa-trash text-rose-500" />
                      </Button>
                    </div>
                  </div>
                  {question.options.length > 0 && (
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                      {question.options.map((option, optionIndex) => (
                        <li
                          key={optionIndex}
                          className={`rounded border px-2 py-1 text-xs ${
                            String(optionIndex) === String(question.answer)
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-100 text-slate-600"
                          }`}
                        >
                          {String.fromCharCode(65 + optionIndex)}. {option}
                        </li>
                      ))}
                    </ul>
                  )}
                  {question.answer && question.kind !== "mcq" && (
                    <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      Expected answer: <span className="font-mono">{question.answer}</span>
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-list-check"
              title="No questions yet"
              description="Add multiple choice, short answer or code questions."
            />
          )}
        </Card>
      )}

      {staff && (
        <Card title="Attempts" subtitle="Live and submitted attempts">
          {attempts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2">Student</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Score</th>
                    <th className="py-2">Deadline</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="py-2">
                        <p className="font-medium text-slate-700">
                          {attempt.student?.name || "Unknown student"}
                        </p>
                        <p className="text-xs text-slate-400">{attempt.student?.email}</p>
                      </td>
                      <td className="py-2">
                        <Badge
                          tone={attempt.status === "submitted" ? "approved" : "pending"}
                        >
                          {attempt.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-slate-600">
                        {attempt.score !== null
                          ? `${attempt.score} / ${attempt.maxScore}`
                          : "—"}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {formatDateTime(attempt.deadline)}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/monitor/${assessment.id}`}
                          className="text-xs font-semibold text-teal-700"
                        >
                          Monitor
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="fa-user-clock" title="No attempts yet" />
          )}
        </Card>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit assessment"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-assessment-form" loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="edit-assessment-form"
          onSubmit={saveAssessment}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Title" className="sm:col-span-2">
            <Input name="title" defaultValue={assessment.title} required />
          </Field>
          <Field label="Opens at">
            <Input
              name="opensAt"
              type="datetime-local"
              defaultValue={toLocalInput(assessment.opensAt)}
              required
            />
          </Field>
          <Field label="Closes at">
            <Input
              name="closesAt"
              type="datetime-local"
              defaultValue={toLocalInput(assessment.closesAt)}
              required
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              name="durationMinutes"
              type="number"
              min={1}
              max={600}
              defaultValue={assessment.durationMinutes}
            />
          </Field>
          <Field label="Max attempts">
            <Input
              name="maxAttempts"
              type="number"
              min={1}
              max={10}
              defaultValue={assessment.maxAttempts}
            />
          </Field>
          <Field label="IP / CIDR allow-list" className="sm:col-span-2">
            <Textarea
              name="ipAllowlist"
              defaultValue={(assessment.ipAllowlist || []).join("\n")}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" defaultValue={assessment.description} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={questionOpen}
        onClose={() => {
          setQuestionOpen(false);
          setEditingQuestion(null);
        }}
        title={editingQuestion ? "Edit question" : "New question"}
        width="max-w-2xl"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setQuestionOpen(false);
                setEditingQuestion(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="question-form" loading={saving}>
              Save question
            </Button>
          </>
        }
      >
        <form id="question-form" onSubmit={saveQuestion} className="grid gap-3 sm:grid-cols-2">
          <Field label="Prompt" className="sm:col-span-2">
            <Textarea
              name="prompt"
              defaultValue={editingQuestion?.prompt || ""}
              required
            />
          </Field>
          <Field label="Type">
            <Select name="kind" defaultValue={editingQuestion?.kind || "short"}>
              <option value="short">Short answer</option>
              <option value="mcq">Multiple choice</option>
              <option value="code">Code</option>
            </Select>
          </Field>
          <Field label="Points">
            <Input
              name="points"
              type="number"
              min={0}
              step="0.5"
              defaultValue={editingQuestion?.points ?? 1}
            />
          </Field>
          <Field
            label="Options (one per line, MCQ only)"
            className="sm:col-span-2"
          >
            <Textarea
              name="options"
              defaultValue={(editingQuestion?.options || []).join("\n")}
              placeholder={"First option\nSecond option"}
            />
          </Field>
          <Field label="Code language">
            <Select
              name="language"
              defaultValue={editingQuestion?.language || "python"}
            >
              <option value="python">Python</option>
              <option value="c">C</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
              <option value="sql">SQL</option>
            </Select>
          </Field>
          <Field label="Position">
            <Input
              name="position"
              type="number"
              defaultValue={editingQuestion?.position ?? assessment.questions?.length ?? 0}
            />
          </Field>
          <Field
            label="Correct answer"
            hint="MCQ: option index (0-based). Short: exact value; use | for alternatives."
            className="sm:col-span-2"
          >
            <Input name="answer" defaultValue={editingQuestion?.answer || ""} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={casesQuestion !== null}
        onClose={() => setCasesQuestion(null)}
        title="Test cases"
        width="max-w-2xl"
      >
        {caseLoading ? (
          <Spinner label="Loading test cases…" />
        ) : (
          <div className="space-y-3">
            {cases.length ? (
              <div className="space-y-2">
                {cases.map((testCase) => (
                  <div
                    key={testCase.id}
                    className="rounded-md border border-slate-100 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">
                        Case #{testCase.id} {testCase.hidden ? "(hidden)" : "(visible)"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCase(testCase.id)}
                      >
                        <i className="fa-solid fa-trash text-rose-500" />
                      </Button>
                    </div>
                    <p className="mt-1 text-slate-500">Input:</p>
                    <pre className="whitespace-pre-wrap rounded bg-slate-50 p-1">
                      {testCase.input || "(empty)"}
                    </pre>
                    <p className="mt-1 text-slate-500">Expected output:</p>
                    <pre className="whitespace-pre-wrap rounded bg-slate-50 p-1">
                      {testCase.expectedOutput}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <Alert tone="info">No test cases yet.</Alert>
            )}
            <form onSubmit={addCase} className="space-y-2 border-t border-slate-100 pt-3">
              <Field label="Input (stdin)">
                <Textarea name="input" className="min-h-16 font-mono text-xs" />
              </Field>
              <Field label="Expected output">
                <Textarea
                  name="expectedOutput"
                  required
                  className="min-h-16 font-mono text-xs"
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-4">
                <Field label="Points">
                  <Input name="points" type="number" min={0} step="0.5" defaultValue={1} />
                </Field>
                <Field label="Time (ms)">
                  <Input name="timeLimitMs" type="number" min={100} defaultValue={2000} />
                </Field>
                <Field label="Memory (MB)">
                  <Input name="memoryMb" type="number" min={32} defaultValue={256} />
                </Field>
                <Field label="Hidden">
                  <label className="flex items-center gap-2 pt-2 text-sm text-slate-600">
                    <input type="checkbox" name="hidden" className="h-4 w-4" />
                    Hidden
                  </label>
                </Field>
              </div>
              <Button type="submit" size="sm" loading={saving}>
                <i className="fa-solid fa-plus" /> Add test case
              </Button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
