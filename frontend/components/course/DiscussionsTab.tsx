"use client";
import { confirmInline } from "../InlineConfirm";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, roleLabel } from "../../lib/format";
import type { DiscussionPost } from "../../lib/types";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  Spinner,
  Textarea,
} from "../ui";
import { isStaff, type CourseTabProps } from "./types";

type PeerReview = {
  id: number; attemptId: number; assessmentTitle: string; body: string;
  status: "pending" | "approved" | "rejected";
  reviewer: { id: number; name: string }; student: { id: number; name: string };
};
type ReviewTarget = { id: number; assessmentTitle: string; student: { id: number; name: string } };

export function DiscussionsTab({ course, role, user }: CourseTabProps) {
  const staff = isStaff(role);
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [targets, setTargets] = useState<ReviewTarget[]>([]);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewTarget, setReviewTarget] = useState("");
  const moderator = staff && (user.role === "teacher" || user.role === "admin");

  async function load() {
    setLoading(true);
    try {
      const [data, reviewData] = await Promise.all([
        api<{ posts: DiscussionPost[] }>(`/api/courses/${course.id}/discussions`),
        api<{ reviews: PeerReview[]; targets: ReviewTarget[] }>(`/api/courses/${course.id}/peer-reviews`),
      ]);
      setPosts(data.posts);
      setReviews(reviewData.reviews || []);
      setTargets(reviewData.targets || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [course.id]);

  const roots = useMemo(() => posts.filter((post) => !post.parentId), [posts]);
  const replies = useMemo(() => {
    const map = new Map<number, DiscussionPost[]>();
    for (const post of posts) {
      if (!post.parentId) continue;
      const list = map.get(post.parentId) || [];
      list.push(post);
      map.set(post.parentId, list);
    }
    return map;
  }, [posts]);

  async function post(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/courses/${course.id}/discussions`, {
        method: "POST",
        body: { body },
      });
      setBody("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function reply(parentId: number) {
    if (!replyBody.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/courses/${course.id}/discussions`, {
        method: "POST",
        body: { body: replyBody, parentId },
      });
      setReplyBody("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(post: DiscussionPost) {
    if (!await confirmInline("Xóa bài thảo luận này?")) return;
    try {
      await api(`/api/discussions/${post.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function acceptAnswer(answer: DiscussionPost) {
    if (!await confirmInline("Chọn câu trả lời hữu ích nhất? Mỗi câu hỏi chỉ chọn một lần để bảo đảm điểm thưởng công bằng.")) return;
    setSaving(true); setError("");
    try { await api(`/api/discussions/${answer.id}/best-answer`, { method: "POST", body: {} }); await load(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api(`/api/courses/${course.id}/peer-reviews`, { method: "POST", body: { attemptId: Number(reviewTarget), body: reviewBody } });
      setReviewBody(""); setReviewTarget(""); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  async function decideReview(id: number, status: "approved" | "rejected") {
    setSaving(true); setError("");
    try { await api(`/api/peer-reviews/${id}`, { method: "PATCH", body: { status } }); await load(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner label="Đang tải thảo luận…" />;

  function renderPost(post: DiscussionPost, nested = false) {
    return (
      <div
        key={post.id}
        className={nested ? "ml-8 mt-2 border-l-2 border-slate-100 pl-3" : "mt-3"}
      >
        <div className={`rounded-md border p-3 ${post.bestAnswer ? "border-amber-300 bg-amber-50" : "border-slate-100"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <Avatar name={post.author?.name} role={post.author?.role} />
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {post.author?.name || "Unknown"}{" "}
                  <span className="text-[11px] font-normal text-slate-400">
                    {roleLabel(post.author?.role)} · {formatDateTime(post.createdAt)}
                  </span>
                </p>
                <p className="prose-lesson mt-1 text-sm text-slate-600">{post.body}</p>
                {post.bestAnswer && <p className="mt-2 text-xs font-bold text-amber-800"><i className="fa-solid fa-award mr-1" /> Câu trả lời hữu ích nhất · +7 EXP</p>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {moderator && nested && !post.bestAnswer && post.author?.role === "student" && posts.some(root => root.id === post.parentId && !root.bestAnswerId && root.author?.role === "student" && root.author?.id !== post.author?.id) && <Button size="sm" variant="secondary" disabled={saving} onClick={() => void acceptAnswer(post)}>Hữu ích nhất</Button>}
              {!nested && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    setReplyTo(replyTo === post.id ? null : post.id);
                    setReplyBody("");
                  }}
                >
                  <i className="fa-solid fa-reply" /> Trả lời
                </Button>
              )}
              {(staff || post.author?.id === user.id) && (
                <Button size="sm" variant="ghost" onClick={() => remove(post)}>
                  <i className="fa-solid fa-trash text-rose-500" />
                </Button>
              )}
            </div>
          </div>
        </div>
        {replies.get(post.id)?.map((child) => renderPost(child, true))}
        {replyTo === post.id && (
          <div className="ml-8 mt-2 flex gap-2">
            <Textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Viết trả lời…"
              className="min-h-16 flex-1"
            />
            <div className="flex flex-col gap-1">
              <Button size="sm" loading={saving} onClick={() => reply(post.id)}>
                Gửi
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setReplyTo(null)}>
                Hủy
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card title="Thảo luận" subtitle="Đặt câu hỏi và trả lời bạn cùng lớp">
        <form onSubmit={post} className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Bắt đầu thảo luận…"
            className="min-h-16 flex-1"
          />
          <Button type="submit" loading={saving} className="sm:self-end">
            <i className="fa-solid fa-paper-plane" /> Đăng
          </Button>
        </form>
        {roots.length ? (
          <div>{roots.map((post) => renderPost(post))}</div>
        ) : (
          <EmptyState
            icon="fa-comments"
            title="Chưa có thảo luận"
            description="Hãy bắt đầu cuộc thảo luận."
          />
        )}
      </Card>
      <Card title="Nhận xét chéo" subtitle="Review chi tiết được giảng viên duyệt nhận 6 EXP, một lần cho mỗi bài làm.">
        {user.role === "student" && !staff && <form onSubmit={submitReview} className="mb-5 space-y-3">
          <Field label="Bài làm của bạn cùng lớp" hint="Chỉ xem mã bài đã nộp; hãy nhận nội dung bài trực tiếp từ bạn học để review.">
            <Select value={reviewTarget} onChange={event => setReviewTarget(event.target.value)} required>
              <option value="">Chọn bài làm</option>{targets.map(target => <option key={target.id} value={target.id}>#{target.id} · {target.student.name} · {target.assessmentTitle}</option>)}
            </Select>
          </Field>
          <Field label="Nhận xét và đề xuất cải thiện" hint={`${reviewBody.trim().length}/200 ký tự tối thiểu. Nêu lỗi, giải thích và gợi ý sửa cụ thể.`}>
            <Textarea value={reviewBody} onChange={event => setReviewBody(event.target.value)} minLength={200} maxLength={10000} rows={5} required />
          </Field>
          <Button type="submit" loading={saving} disabled={!reviewTarget || reviewBody.trim().length < 200}>Gửi giảng viên duyệt</Button>
        </form>}
        <div className="space-y-3">{reviews.map(review => <article key={review.id} className="rounded-md border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{review.reviewer.name} → {review.student.name}</p><span className="text-xs font-medium text-slate-500">{review.status === "approved" ? "Đã duyệt · +6 EXP" : review.status === "rejected" ? "Chưa đạt yêu cầu" : "Chờ giảng viên duyệt"}</span></div>
          <p className="mt-1 text-xs text-slate-500">Bài #{review.attemptId} · {review.assessmentTitle}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{review.body}</p>
          {moderator && review.status === "pending" && <div className="mt-3 flex gap-2"><Button size="sm" disabled={saving} onClick={() => void decideReview(review.id, "approved")}>Duyệt chất lượng</Button><Button size="sm" variant="secondary" disabled={saving} onClick={() => void decideReview(review.id, "rejected")}>Chưa đạt</Button></div>}
        </article>)}{!reviews.length && <p className="py-4 text-sm text-slate-500">Chưa có nhận xét chéo.</p>}</div>
      </Card>
    </div>
  );
}
