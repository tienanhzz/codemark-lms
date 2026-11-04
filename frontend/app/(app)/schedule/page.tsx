"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { cn, formatDate, WEEKDAYS_SHORT } from "../../../lib/format";
import type { ScheduleMeeting } from "../../../lib/types";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from "../../../components/ui";

const COLORS = [
  "border-teal-300 bg-teal-50 text-teal-800",
  "border-emerald-300 bg-emerald-50 text-emerald-800",
  "border-amber-300 bg-amber-50 text-amber-800",
  "border-purple-300 bg-purple-50 text-purple-800",
  "border-rose-300 bg-rose-50 text-rose-800",
  "border-cyan-300 bg-cyan-50 text-cyan-800",
];

function colorFor(courseId: number) {
  return COLORS[(courseId - 1) % COLORS.length];
}

export default function SchedulePage() {
  const [meetings, setMeetings] = useState<ScheduleMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ meetings: ScheduleMeeting[] }>("/api/schedule/me")
      .then((data) => setMeetings(data.meetings))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const todayIndex = (new Date().getDay() + 6) % 7;
  const byDay = useMemo(
    () =>
      WEEKDAYS_SHORT.map((_, index) =>
        meetings
          .filter((meeting) => meeting.weekday === index)
          .sort((a, b) => a.start.localeCompare(b.start)),
      ),
    [meetings],
  );

  if (loading) return <Spinner label="Loading timetable…" />;
  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <div>
      <PageHeader
        icon="fa-calendar-days"
        title="Weekly schedule"
        description="Your weekly classes, meeting times and locations."
      />

      {meetings.length === 0 ? (
        <EmptyState
          icon="fa-calendar-xmark"
          title="No meetings scheduled"
          description="Once a teacher adds weekly meeting times, they appear here."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {WEEKDAYS_SHORT.map((day, index) => (
              <div
                key={day}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white shadow-sm",
                  index === todayIndex ? "border-teal-400" : "border-slate-200",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between rounded-t-lg border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide",
                    index === todayIndex
                      ? "border-teal-200 bg-teal-800 text-white"
                      : "border-slate-100 bg-slate-50 text-slate-500",
                  )}
                >
                  {day}
                  <span className="text-[10px] font-normal">
                    {byDay[index].length}
                  </span>
                </div>
                <div className="space-y-2 p-2">
                  {byDay[index].length ? (
                    byDay[index].map((meeting) => (
                      <Link
                        key={`${meeting.courseId}-${meeting.id}`}
                        href={`/courses/${meeting.courseId}`}
                        className={cn(
                          "block rounded-md border px-2 py-2 text-xs transition hover:brightness-95",
                          colorFor(meeting.courseId),
                        )}
                      >
                        <p className="font-bold">{meeting.course}</p>
                        <p className="mt-0.5 line-clamp-2 font-medium">{meeting.title}</p>
                        <p className="mt-1 text-[11px] opacity-80">
                          {meeting.start}–{meeting.end}
                        </p>
                        <p className="text-[11px] opacity-80">{meeting.location}</p>
                      </Link>
                    ))
                  ) : (
                    <p className="px-1 py-4 text-center text-[11px] text-slate-300">
                      No classes
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Card className="mt-5" title="Course terms" subtitle="Reference dates for each scheduled course">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(new Map(meetings.map((m) => [m.courseId, m])).values()).map(
                (meeting) => (
                  <div
                    key={meeting.courseId}
                    className="rounded-md border border-slate-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">
                        {meeting.course}
                      </p>
                      <Badge tone="info">{meeting.term}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{meeting.title}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDate(meeting.startDate)} – {formatDate(meeting.endDate)}
                    </p>
                  </div>
                ),
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
