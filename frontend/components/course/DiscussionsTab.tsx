"use client";

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
  Spinner,
  Textarea,
} from "../ui";
import { isStaff, type CourseTabProps } from "./types";

export function DiscussionsTab({ course, role, user }: CourseTabProps) {
  const staff = isStaff(role);
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ posts: DiscussionPost[] }>(
        `/api/courses/${course.id}/discussions`,
      );
      setPosts(data.posts);
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
    if (!confirm("Delete this discussion post?")) return;
    try {
      await api(`/api/discussions/${post.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <Spinner label="Loading discussions…" />;

  function renderPost(post: DiscussionPost, nested = false) {
    return (
      <div
        key={post.id}
        className={nested ? "ml-8 mt-2 border-l-2 border-slate-100 pl-3" : "mt-3"}
      >
        <div className="rounded-md border border-slate-100 p-3">
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
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!nested && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyTo(replyTo === post.id ? null : post.id);
                    setReplyBody("");
                  }}
                >
                  <i className="fa-solid fa-reply" /> Reply
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
              placeholder="Write a reply…"
              className="min-h-16 flex-1"
            />
            <div className="flex flex-col gap-1">
              <Button size="sm" loading={saving} onClick={() => reply(post.id)}>
                Send
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setReplyTo(null)}>
                Cancel
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
      <Card title="Discussions" subtitle="Ask questions and reply to classmates">
        <form onSubmit={post} className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Start a discussion…"
            className="min-h-16 flex-1"
          />
          <Button type="submit" loading={saving} className="sm:self-end">
            <i className="fa-solid fa-paper-plane" /> Post
          </Button>
        </form>
        {roots.length ? (
          <div>{roots.map((post) => renderPost(post))}</div>
        ) : (
          <EmptyState
            icon="fa-comments"
            title="No discussions yet"
            description="Be the first to start a conversation."
          />
        )}
      </Card>
    </div>
  );
}
