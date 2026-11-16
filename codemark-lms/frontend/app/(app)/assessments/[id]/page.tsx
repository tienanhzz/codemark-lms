"use client";
import { confirmInline } from "../../../../components/InlineConfirm";

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
  Drawer,
  Select,
  Spinner,
  Textarea,
} from "../../../../components/ui";
import { isStaff } from "../../../../components/course/types";
import { TeacherGradePanel } from "../../../../components/TeacherGradePanel";

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
  const [availableTags, setAvailableTags] = useState<Array<{tagId:string;label:string}>>([]);
  const [gradingId, setGradingId] = useState<number | null>(null);

  const staff = isStaff(assessment?.role);

  const load = useCallback(async () => {
    try {
      const data = await api<Assessment>(`/api/assessments/${assessmentId}`);
      setAssessment(data);
      if (isStaff(data.role)) {
        const taxonomy = await api<{tags:Array<{tagId:string;label:string;codingQuestion:boolean;assignable:boolean}>}>("/api/taxonomy");
        setAvailableTags(taxonomy.tags.filter((tag)=>tag.codingQuestion&&tag.assignable));
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
          gradingDueAt: form.get("gradingDueAt") ? new Date(String(form.get("gradingDueAt"))).toISOString() : null,
          durationMinutes: Number(form.get("durationMinutes")),
          maxAttempts: Number(form.get("maxAttempts")),
          difficulty: form.get("difficulty"),
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
        tagIds: form.getAll("tagIds").map(String),
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
    if (!await confirmInline("Xóa câu hỏi này và bộ kiểm thử của nó?")) return;
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

  if (loading) return <Spinner label="Đang tải bài kiểm tra…" />;
  if (error && !assessment) return <Alert tone="danger">{error}</Alert>;
  if (!assessment) return null;

  return (
    <div>
      <div className="mb-3">
        <Link
          href={`/courses/${assessment.courseId}`}
          className="text-xs font-medium text-slate-500 hover:text-teal-700"
        >
          <i className="fa-solid fa-arrow-left mr-1" /> Quay lại lớp học
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{assessment.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {assessment.kind} · mở lúc {formatDateTime(assessment.opensAt)} · đóng lúc{" "}
            {formatDateTime(assessment.closesAt)} · {assessment.durationMinutes} phút ·{" "}
            {assessment.maxAttempts} lượt làm(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assessment.published ? (
            <Badge tone="published">Đã công bố</Badge>
          ) : (
            <Badge tone="draft">Bản nháp</Badge>
          )}
          {staff ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <i className="fa-solid fa-pen" /> Sửa
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
                <i className="fa-solid fa-desktop" /> Giám sát
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
                <i className="fa-solid fa-download" /> CSV giám sát
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
        <Card className="mb-4" title="Hướng dẫn">
          <p className="prose-lesson text-sm text-slate-600">{assessment.description}</p>
        </Card>
      )}

      {!staff && (
        <Card
          className="mb-4"
          title="Lượt làm của bạn"
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
                      Lượt làm #{attempt.id} · {attempt.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      Bắt đầu {formatDateTime(attempt.startedAt)} · hạn nộp{" "}
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
                        Tiếp tục
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="fa-file-circle-plus" title="Chưa có lượt làm bài" />
          )}
        </Card>
      )}

      {staff && (
        <Card
          className="mb-4"
          title="Câu hỏi"
          subtitle={`${assessment.questions?.length || 0} questions · answers and hidden cases are staff-only`}
          actions={
            <>
              <Button
                size="sm"
                onClick={async () => {
                  setEditingQuestion(null);
                  setQuestionOpen(true);
                }}
              >
                <i className="fa-solid fa-plus" /> Câu hỏi
              </Button>
              <Link
                href={`/monitor/${assessment.id}`}
                className="text-xs font-semibold text-teal-700"
              >
                Mở giám sát
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
                        {question.points} điểm
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
                          <i className="fa-solid fa-vial" /> Kiểm thử
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
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
                      Đáp án mong đợi: <span className="font-mono">{question.answer}</span>
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-list-check"
              title="Chưa có câu hỏi"
              description="Thêm câu hỏi trắc nghiệm, trả lời ngắn hoặc lập trình."
            />
          )}
        </Card>
      )}

      {staff && (
        <Card title="Lượt làm bài" subtitle="Lượt đang làm và đã nộp">
          {attempts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2">Sinh viên</th>
                    <th className="py-2">Trạng thái</th>
                    <th className="py-2">Điểm</th>
                    <th className="py-2">Hạn nộp</th>
                    <th className="py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="py-2">
                        <p className="font-medium text-slate-700">
                          {attempt.student?.name || "Unknown student"}
                        </p>
                        <p className="text-xs text-slate-400">{attempt.student?.studentId}</p>
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
                        {attempt.status === "submitted" && <Button size="sm" variant="secondary" onClick={() => setGradingId(attempt.id)}>Chấm bài / Feedback</Button>}
                        <Link
                          href={`/monitor/${assessment.id}`}
                          className="text-xs font-semibold text-teal-700"
                        >
                          Giám sát
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="fa-user-clock" title="Chưa có lượt làm bài" />
          )}
        </Card>
      )}

      <TeacherGradePanel attemptId={gradingId} onClose={() => setGradingId(null)} onSaved={() => { setNotice("Đã lưu điểm và feedback."); void load(); }} />
      {!staff && attempts.some(attempt => attempt.teacherFeedback) && <Card title="Feedback từ giảng viên">
        {attempts.filter(attempt => attempt.teacherFeedback).map(attempt => <section key={attempt.id} className="space-y-2 border-b border-slate-100 py-3">
          <h3 className="font-semibold">Lượt làm #{attempt.id}</h3><p className="whitespace-pre-wrap text-sm leading-7">{attempt.teacherFeedback}</p>
          {Object.entries(attempt.inlineFeedback || {}).map(([questionId, comment]) => <p key={questionId} className="whitespace-pre-wrap border-l-2 border-teal-300 pl-3 text-sm leading-7">Câu #{questionId}: {comment}</p>)}
        </section>)}
      </Card>}
      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Sửa bài kiểm tra"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="edit-assessment-form" loading={saving}>
              Lưu
            </Button>
          </>
        }
      >
        <form
          id="edit-assessment-form"
          onSubmit={saveAssessment}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label="Độ khó" hint="Đạt từ 50% nhận EXP một lần">
            <Select name="difficulty" defaultValue={assessment.difficulty || "easy"}>
              <option value="easy">Dễ</option><option value="medium">Trung bình</option>
              <option value="hard">Khó</option><option value="expert">Chuyên gia</option>
            </Select>
          </Field>
          <Field label="Tiêu đề" className="sm:col-span-2">
            <Input name="title" defaultValue={assessment.title} required />
          </Field>
          <Field label="Mở lúc">
            <Input
              name="opensAt"
              type="datetime-local"
              defaultValue={toLocalInput(assessment.opensAt)}
              required
            />
          </Field>
          <Field label="Đóng lúc">
            <Input
              name="closesAt"
              type="datetime-local"
              defaultValue={toLocalInput(assessment.closesAt)}
              required
            />
          </Field>
          <Field label="Thời gian (phút)">
            <Input
              name="durationMinutes"
              type="number"
              min={1}
              max={600}
              defaultValue={assessment.durationMinutes}
            />
          </Field>
          <Field label="Hạn hoàn thành chấm điểm" hint="Đặt hạn để ghi nhận 5 Reputation khi chấm xong toàn bộ sinh viên đúng hạn.">
            <Input name="gradingDueAt" type="datetime-local" defaultValue={assessment.gradingDueAt ? toLocalInput(assessment.gradingDueAt) : ""} />
          </Field>
          <Field label="Số lần làm tối đa">
            <Input
              name="maxAttempts"
              type="number"
              min={1}
              max={10}
              defaultValue={assessment.maxAttempts}
            />
          </Field>
          <Field label="Danh sách IP / CIDR được phép" className="sm:col-span-2">
            <Textarea
              name="ipAllowlist"
              defaultValue={(assessment.ipAllowlist || []).join("\n")}
            />
          </Field>
          <Field label="Mô tả" className="sm:col-span-2">
            <Textarea name="description" defaultValue={assessment.description} />
          </Field>
        </form>
      </Drawer>

      <Drawer
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
              onClick={async () => {
                setQuestionOpen(false);
                setEditingQuestion(null);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" form="question-form" loading={saving}>
              Lưu câu hỏi
            </Button>
          </>
        }
      >
        <form id="question-form" onSubmit={saveQuestion} className="grid gap-3 sm:grid-cols-2">
          <Field label="Đề bài" className="sm:col-span-2">
            <Textarea
              name="prompt"
              defaultValue={editingQuestion?.prompt || ""}
              required
            />
          </Field>
          <Field label="Loại">
            <Select name="kind" defaultValue={editingQuestion?.kind || "short"}>
              <option value="short">Trả lời ngắn</option>
              <option value="mcq">Trắc nghiệm</option>
              <option value="code">Mã</option>
            </Select>
          </Field>
          <Field label="Điểm">
            <Input
              name="points"
              type="number"
              min={0}
              step="0.5"
              defaultValue={editingQuestion?.points ?? 1}
            />
          </Field>
          <Field
            label="Các lựa chọn (mỗi dòng một lựa chọn trắc nghiệm)"
            className="sm:col-span-2"
          >
            <Textarea
              name="options"
              defaultValue={(editingQuestion?.options || []).join("\n")}
              placeholder={"First option\nSecond option"}
            />
          </Field>
          <Field label="Ngôn ngữ lập trình">
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
          <Field label="Thứ tự">
            <Input
              name="position"
              type="number"
              defaultValue={editingQuestion?.position ?? assessment.questions?.length ?? 0}
            />
          </Field>
          <Field label="Chủ đề" hint="Có thể chọn nhiều thẻ; danh mục cha chỉ dùng để điều hướng." className="sm:col-span-2">
            <select name="tagIds" multiple defaultValue={editingQuestion?.tagIds||[]} className="w-full min-h-32 rounded-lg border border-slate-200 bg-white p-2 text-sm">
              {availableTags.map(tag=><option key={tag.tagId} value={tag.tagId}>{tag.label} · {tag.tagId}</option>)}
            </select>
          </Field>
          <Field
            label="Đáp án đúng"
            hint="Trắc nghiệm: số thứ tự đáp án từ 0. Trả lời ngắn: đáp án chính xác, ngăn cách nhiều đáp án bằng |."
            className="sm:col-span-2"
          >
            <Input name="answer" defaultValue={editingQuestion?.answer || ""} />
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={casesQuestion !== null}
        onClose={() => setCasesQuestion(null)}
        title="Bộ kiểm thử"
        width="max-w-2xl"
      >
        {caseLoading ? (
          <Spinner label="Đang tải bộ kiểm thử…" />
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
                        Bộ kiểm thử #{testCase.id} {testCase.hidden ? "(hidden)" : "(visible)"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCase(testCase.id)}
                      >
                        <i className="fa-solid fa-trash text-rose-500" />
                      </Button>
                    </div>
                    <p className="mt-1 text-slate-500">Đầu vào:</p>
                    <pre className="whitespace-pre-wrap rounded bg-slate-50 p-1">
                      {testCase.input || "(empty)"}
                    </pre>
                    <p className="mt-1 text-slate-500">Kết quả mong đợi:</p>
                    <pre className="whitespace-pre-wrap rounded bg-slate-50 p-1">
                      {testCase.expectedOutput}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <Alert tone="info">Chưa có bộ kiểm thử.</Alert>
            )}
            <form onSubmit={addCase} className="space-y-2 border-t border-slate-100 pt-3">
              <Field label="Đầu vào (stdin)">
                <Textarea name="input" className="min-h-16 font-mono text-xs" />
              </Field>
              <Field label="Kết quả mong đợi">
                <Textarea
                  name="expectedOutput"
                  required
                  className="min-h-16 font-mono text-xs"
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-4">
                <Field label="Điểm">
                  <Input name="points" type="number" min={0} step="0.5" defaultValue={1} />
                </Field>
                <Field label="Thời gian (ms)">
                  <Input name="timeLimitMs" type="number" min={100} defaultValue={2000} />
                </Field>
                <Field label="Bộ nhớ (MB)">
                  <Input name="memoryMb" type="number" min={32} defaultValue={256} />
                </Field>
                <Field label="Ẩn">
                  <label className="flex items-center gap-2 pt-2 text-sm text-slate-600">
                    <input type="checkbox" name="hidden" className="h-4 w-4" />
                    Ẩn
                  </label>
                </Field>
              </div>
              <Button type="submit" size="sm" loading={saving}>
                <i className="fa-solid fa-plus" /> Thêm bộ kiểm thử
              </Button>
            </form>
          </div>
        )}
      </Drawer>
    </div>
  );
}
