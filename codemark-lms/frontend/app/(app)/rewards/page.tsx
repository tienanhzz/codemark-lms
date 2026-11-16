"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "../../../lib/api";
import { useAuth } from "../../../components/AuthProvider";
import { AvatarFrame, rewardThemeClasses, type RewardProfile } from "../../../components/RewardAppearance";
import { Alert, Avatar, Badge, Button, Card, Field, PageHeader, Select, Spinner, Textarea } from "../../../components/ui";

type Rule = { action: string; points: number; label: string };
type Course = { id: number; code: string; title: string };
type Assessment = { id: number; title: string; kind: string };
type RewardRequest = {
  id: number; courseId: number; courseCode: string; assessmentId: number | null; assessmentTitle: string | null;
  student: { id: number; name: string; studentId: string }; requestText: string;
  status: "pending" | "approved" | "rejected"; decisionNote: string | null; reviewedAt: string | null; createdAt: string;
};
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export default function RewardsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<RewardProfile | null>(null);
  const [rules, setRules] = useState<{ student: Rule[]; teacher: Rule[] }>({ student: [], teacher: [] });
  const [requests, setRequests] = useState<RewardRequest[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [course, setCourse] = useState("");
  const [requestText, setRequestText] = useState("");
  const [frame, setFrame] = useState("default");
  const [theme, setTheme] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const staff = user?.role === "teacher" || user?.role === "admin";
  const unit = user?.role === "teacher" ? "Reputation" : "EXP";

  const load = useCallback(async () => {
    if (!user || user.mustChangePassword) return;
    try {
      const [progress, catalog, history, classes] = await Promise.all([
        api<RewardProfile>("/api/rank/profile"),
        api<{ student: Rule[]; teacher: Rule[] }>("/api/rank/rules"),
        api<{ requests: RewardRequest[] }>("/api/rank/redemptions"),
        api<{ courses: Course[] }>("/api/courses"),
      ]);
      setProfile(progress); setFrame(progress.selectedFrame); setTheme(progress.selectedTheme);
      setRules(catalog); setRequests(history.requests); setCourses(classes.courses);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [user?.id, user?.mustChangePassword]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    setAssessments([]);
    if (course) api<{ assessments: Assessment[] }>(`/api/courses/${course}/assessments`)
      .then(data => { if (active) setAssessments(data.assessments.filter(a => a.kind === "exam")); })
      .catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [course]);

  async function saveAppearance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<RewardProfile>("/api/rank/cosmetics", { method: "PUT", body: { frame, theme } });
      setProfile(result); setNotice("Đã áp dụng khung avatar và giao diện cho hồ sơ của bạn.");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function requestReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/rank/redemptions", { method: "POST", body: {
        courseId: Number(course), assessmentId: fields.get("assessmentId") ? Number(fields.get("assessmentId")) : null, requestText,
      } });
      setRequestText(""); setNotice("Đã gửi đề xuất đổi thưởng để giảng viên xem xét."); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function review(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/rank/redemptions/${id}/review`, { method: "POST", body: { status: fields.get("status"), decisionNote: fields.get("decisionNote") } });
      setNotice("Đã ghi nhận quyết định. Điểm bài thi vẫn được xử lý theo quy định của trường."); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  if (loading) return <Spinner label="Đang tải thành tích và phần thưởng…" />;

  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader icon="fa-medal" title="Danh hiệu & phần thưởng" description="Ghi nhận từng đóng góp cho lớp học và cộng đồng CodeMark." actions={<Link href="/leaderboard" className="text-sm font-semibold text-teal-800">Xem bảng xếp hạng →</Link>} />
    <div aria-live="polite" className="space-y-3">{error && <Alert tone="danger">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}</div>
    {profile && <>
      <section className={`flex flex-wrap items-center justify-between gap-5 border border-slate-200 p-6 ${rewardThemeClasses[theme] || rewardThemeClasses.default}`}>
        <div className="flex items-center gap-4">
          <AvatarFrame frame={frame}><Avatar name={user?.name} role={user?.role} /></AvatarFrame>
          <div><h2 className="text-xl font-bold text-slate-900">{user?.name}</h2><p className="mt-1 text-xs text-slate-500">{profile.season || "Chưa có mùa đang hoạt động"}</p></div>
        </div>
        <div className="text-right"><p className="text-3xl font-extrabold tabular-nums text-teal-900">{number.format(profile.totalPoints)} <span className="text-sm font-semibold">{unit}</span></p>
          <p className="mt-1 text-xs text-slate-500">{user?.role === "student" ? `Tổng các lớp + ${number.format(profile.globalPoints)} EXP hoạt động chung` : "Tín nhiệm ghi nhận trong mùa hiện tại"}</p>
        </div>
      </section>

      <Card title="Huy hiệu & danh hiệu">
        {profile.badges.length ? <ul className="grid gap-3 sm:grid-cols-2">{profile.badges.map(badge => <li key={badge.id} className="flex gap-3 border border-amber-200 bg-amber-50 p-4">
          <i aria-hidden="true" className="fa-solid fa-award mt-1 text-2xl text-amber-600" /><div><h3 className="font-bold text-amber-900">{badge.title}</h3><p className="mt-1 text-xs leading-6 text-amber-800">{badge.description}</p></div>
        </li>)}</ul> : <p className="text-sm leading-7 text-slate-500">Chưa có huy hiệu trong mùa này. Hoàn thành hoạt động và đóng góp cho lớp để được ghi nhận.</p>}
      </Card>

      <Card title="Ngoại hình đã mở khóa" subtitle="Khung avatar hiển thị cạnh tên tài khoản; theme thay đổi thanh tiêu đề của bạn.">
        <form onSubmit={saveAppearance} className="grid items-end gap-4 sm:grid-cols-3">
          <Field label="Khung avatar"><Select value={frame} onChange={e => setFrame(e.target.value)}>{profile.unlocks.frames.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
          <Field label="Theme"><Select value={theme} onChange={e => setTheme(e.target.value)}>{profile.unlocks.themes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
          <Button type="submit" loading={busy}>Áp dụng ngoại hình</Button>
        </form>
      </Card>
    </>}

    <div className="grid gap-5 lg:grid-cols-2">{(["student", "teacher"] as const).map(role => <Card key={role} title={role === "student" ? "EXP sinh viên · 3–7 điểm" : "Reputation giảng viên · 3–7 điểm"}>
      <ul className="divide-y divide-slate-100">{rules[role].map(rule => <li key={rule.action} className="flex items-start justify-between gap-4 py-3"><p className="text-sm leading-6 text-slate-600">{rule.label}</p><span className="shrink-0 bg-teal-50 px-2.5 py-1 text-sm font-bold text-teal-800">+{rule.points}</span></li>)}</ul>
    </Card>)}</div>

    {user?.role === "student" && <Card title="Đề xuất đổi thưởng học tập" subtitle="Gửi đề xuất cộng điểm giữa kỳ cho giảng viên phụ trách lớp.">
      <Alert>Nhà trường cần xác định mốc EXP và mức điểm được đổi. Đề xuất và quyết định tại đây không tự trừ EXP hoặc thay đổi điểm bài thi.</Alert>
      <form onSubmit={requestReward} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lớp học"><Select required value={course} onChange={e => setCourse(e.target.value)}><option value="">Chọn lớp học</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</Select></Field>
          <Field label="Bài thi đã công bố (nếu có)"><Select name="assessmentId" key={course} defaultValue="" disabled={!course}><option value="">Chưa chỉ định bài thi</option>{assessments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</Select></Field>
        </div>
        <Field label="Nội dung đề xuất"><Textarea required minLength={10} maxLength={2000} rows={3} value={requestText} onChange={e => setRequestText(e.target.value)} placeholder="Nêu thành tích và phần thưởng học tập bạn đề xuất…" /></Field>
        <Button type="submit" disabled={!course} loading={busy}>Gửi đề xuất cho giảng viên</Button>
      </form>
    </Card>}

    {(user?.role === "student" || staff) && <Card title={staff ? "Xem xét đề xuất đổi thưởng" : "Đề xuất của bạn"}>
      {requests.length ? <ul className="space-y-4">{requests.map(request => <li key={request.id} className="border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{request.courseCode} · {request.student.name} <span className="font-normal text-slate-500">({request.student.studentId})</span></p><Badge tone={request.status}>{request.status}</Badge></div>
        {request.assessmentTitle && <p className="mt-2 text-xs text-slate-500">Bài thi: {request.assessmentTitle}</p>}
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{request.requestText}</p>
        <p className="mt-2 text-xs text-slate-400">Gửi lúc {new Date(request.createdAt).toLocaleString("vi-VN")}</p>
        {request.decisionNote && <p className="mt-3 border-l-2 border-teal-300 pl-3 text-sm leading-6 text-teal-900">Phản hồi: {request.decisionNote}</p>}
        {staff && request.status === "pending" && <form onSubmit={e => review(e, request.id)} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <Field label="Quyết định"><Select name="status" defaultValue="approved"><option value="approved">Đồng ý đề xuất</option><option value="rejected">Từ chối đề xuất</option></Select></Field>
          <Field label="Ý kiến của người duyệt"><Textarea name="decisionNote" required maxLength={2000} rows={2} placeholder="Ghi căn cứ và hướng xử lý theo quy định của trường…" /></Field>
          <Button type="submit" size="sm" loading={busy}>Ghi nhận quyết định</Button>
        </form>}
      </li>)}</ul> : <p className="text-sm text-slate-500">Chưa có đề xuất đổi thưởng.</p>}
    </Card>}
  </div>;
}
