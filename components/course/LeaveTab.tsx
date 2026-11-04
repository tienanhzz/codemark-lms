"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, download, errorMessage } from "../../lib/api";
import { formatBytes, formatDateTime, weekdayName } from "../../lib/format";
import type { LeaveRequest } from "../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  Spinner,
  Textarea,
} from "../ui";
import { isStaff, type CourseTabProps } from "./types";

export function LeaveTab({ course, role }: CourseTabProps) {
  const staff = isStaff(role);
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("pending");

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ leaveRequests: LeaveRequest[] }>(
        `/api/courses/${course.id}/leave-requests`,
      );
      setItems(data.leaveRequests);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [course.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("evidence");
    if (file instanceof File && file.size > 5 * 1024 * 1024) {
      setError("Evidence must be 5 MiB or smaller.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/courses/${course.id}/leave-requests`, {
        method: "POST",
        rawBody: form,
      });
      (event.target as HTMLFormElement).reset();
      setNotice("Leave request submitted for review.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function decide(item: LeaveRequest, status: "approved" | "rejected") {
    const note = prompt(
      status === "approved" ? "Optional approval note:" : "Reason for rejection:",
      "",
    );
    if (note === null) return;
    try {
      await api(`/api/leave-requests/${item.id}/decision`, {
        method: "POST",
        body: { status, note },
      });
      setNotice(`Request ${status}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [items, filter],
  );

  if (loading) return <Spinner label="Loading leave requests…" />;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {!staff && (
        <Card title="Request leave" subtitle="Attach one JPEG, PNG, WebP image or PDF (max 5 MiB)">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Course meeting">
              <Select name="meetingId" defaultValue="">
                <option value="">No specific meeting</option>
                {course.meetings?.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {weekdayName(meeting.weekday)} {meeting.start}–{meeting.end}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Evidence file">
              <input
                name="evidence"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </Field>
            <Field label="Reason" className="sm:col-span-2">
              <Textarea name="reason" required placeholder="Explain the absence…" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving}>
                <i className="fa-solid fa-paper-plane" /> Submit request
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Leave requests"
        subtitle={staff ? "Approve or reject with an audit trail" : "Your submitted requests"}
        actions={
          staff ? (
            <Select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-40"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </Select>
          ) : undefined
        }
      >
        {visible.length ? (
          <div className="space-y-2">
            {visible.map((item) => (
              <article key={item.id} className="rounded-md border border-slate-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {staff ? item.student?.name || "Student" : "Leave request"}
                      <span className="ml-2 text-[11px] font-normal text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.meetingId
                        ? `Meeting #${item.meetingId}`
                        : "No specific meeting"}
                      {item.evidenceName
                        ? ` · Evidence: ${item.evidenceName} (${formatBytes(
                            item.evidenceSize,
                          )})`
                        : ""}
                    </p>
                    {item.decisionNote && (
                      <p className="mt-1 text-xs text-slate-500">
                        Decision note: {item.decisionNote}
                      </p>
                    )}
                  </div>
                  <Badge tone={item.status}>{item.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.evidenceName && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        download(
                          `/api/leave-requests/${item.id}/evidence`,
                          item.evidenceName || "evidence",
                        ).catch((err) => setError(errorMessage(err)))
                      }
                    >
                      <i className="fa-solid fa-download" /> Evidence
                    </Button>
                  )}
                  {staff && item.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => decide(item, "approved")}
                      >
                        <i className="fa-solid fa-check" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => decide(item, "rejected")}
                      >
                        <i className="fa-solid fa-xmark" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="fa-envelope-open-text"
            title="No leave requests"
            description={
              staff
                ? "No requests match this filter."
                : "You have not submitted any leave requests."
            }
          />
        )}
      </Card>
    </div>
  );
}
