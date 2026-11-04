"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import {
  cn,
  formatDate,
  formatDateTime,
  relativeTime,
  weekdayName,
} from "../../../lib/format";
import type {
  AuditEvent,
  Dashboard,
  Role,
  ScheduleMeeting,
  Stats,
} from "../../../lib/types";
import { useAuth } from "../../../components/AuthProvider";
import {
  Alert,
  Badge,
  BarChart,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "../../../components/ui";

export default function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [schedule, setSchedule] = useState<ScheduleMeeting[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [dash, sched] = await Promise.all([
          api<Dashboard>("/api/dashboard"),
          api<{ meetings: ScheduleMeeting[] }>("/api/schedule/me"),
        ]);
        if (!active) return;
        setDashboard(dash);
        setSchedule(sched.meetings);
        if (user?.role === "admin") {
          const system = await api<Stats>("/api/admin/stats");
          if (active) setStats(system);
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user?.role]);

  const upcoming = useMemo(() => {
    const todayIndex = (new Date().getDay() + 6) % 7;
    return [...schedule]
      .sort(
        (a, b) =>
          ((a.weekday - todayIndex + 7) % 7) - ((b.weekday - todayIndex + 7) % 7) ||
          a.start.localeCompare(b.start),
      )
      .slice(0, 6);
  }, [schedule]);

  if (loading) return <Spinner label="Loading your workspace…" />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!dashboard || !user) return null;

  const isStudent = user.role === "student";
  const isAdmin = user.role === "admin";
  const managed = dashboard.managedCourses;

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-teal-900/10 bg-[#102c36] p-5 sm:p-7">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200">Your digital classroom</p>
      <div className="dashboard-welcome">
      <PageHeader
        icon="fa-gauge-high"
        title={`Welcome back, ${user.name.trim().split(/\s+/).pop() || user.name}`}
        description={
          isStudent
            ? "Your current courses, upcoming assessments and weekly timetable."
            : isAdmin
              ? "An overview of your school, people and daily activity."
              : "Your teaching workspace across assigned courses."
        }
        actions={
          <Link
            href="/schedule"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <i className="fa-solid fa-calendar-days" />
            Weekly schedule
          </Link>
        }
      />
      </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="fa-book-open"
          label="Current courses"
          value={dashboard.currentCourses}
          hint={`${dashboard.courses.length} total enrolments`}
          tone="sky"
        />
        {isStudent ? (
          <>
            <StatCard
              icon="fa-star"
              label="Average score"
              value={dashboard.averageScore ?? "—"}
              hint="Submitted assessments"
              tone="emerald"
            />
            <StatCard
              icon="fa-file-signature"
              label="Upcoming assessments"
              value={dashboard.upcomingAssessments.length}
              hint="Published and open"
              tone="amber"
            />
            <StatCard
              icon="fa-qrcode"
              label="Open attendance"
              value={dashboard.openAttendance.length}
              hint="Sessions accepting check-in"
              tone="purple"
            />
          </>
        ) : isAdmin ? (
          <>
            <StatCard
              icon="fa-users"
              label="Accounts"
              value={Object.values(stats?.users || {}).reduce((a, b) => a + b, 0)}
              hint={`${stats?.activeSessions ?? 0} active sessions`}
              tone="emerald"
            />
            <StatCard
              icon="fa-user-graduate"
              label="Students"
              value={stats?.users?.student ?? 0}
              hint={`${stats?.users?.teacher ?? 0} teachers`}
              tone="amber"
            />
            <StatCard
              icon="fa-triangle-exclamation"
              label="Pending leave"
              value={stats?.pendingLeave ?? 0}
              hint="Awaiting approval"
              tone="rose"
            />
          </>
        ) : (
          <>
            <StatCard
              icon="fa-chalkboard-user"
              label="Managed courses"
              value={managed.length}
              hint="You are the course owner"
              tone="emerald"
            />
            <StatCard
              icon="fa-file-signature"
              label="Assessments"
              value={stats?.assessments ?? dashboard.upcomingAssessments.length}
              hint="Across your courses"
              tone="amber"
            />
            <StatCard
              icon="fa-triangle-exclamation"
              label="Pending leave"
              value={dashboard.pendingLeave}
              hint="Requests to review"
              tone="rose"
            />
          </>
        )}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="This week"
          subtitle="Meetings for your current-semester courses"
          actions={
            <Link href="/schedule" className="text-xs font-semibold text-teal-700">
              Full calendar <i className="fa-solid fa-arrow-right ml-1" />
            </Link>
          }
        >
          {upcoming.length ? (
            <div className="space-y-2">
              {upcoming.map((meeting) => (
                <div
                  key={`${meeting.courseId}-${meeting.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-teal-700 shadow-sm">
                      <i className="fa-solid fa-clock" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {meeting.course} — {meeting.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {weekdayName(meeting.weekday)} · {meeting.start}–{meeting.end} ·{" "}
                        {meeting.location}
                      </p>
                    </div>
                  </div>
                  <Badge tone="info">{meeting.term}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-calendar-xmark"
              title="No meetings scheduled"
              description="Course meetings added by teachers will appear here."
            />
          )}
        </Card>

        <Card title="Upcoming assessments">
          {dashboard.upcomingAssessments.length ? (
            <div className="space-y-2">
              {dashboard.upcomingAssessments.map((assessment) => (
                <Link
                  key={assessment.id}
                  href={`/assessments/${assessment.id}`}
                  className="block rounded-md border border-slate-100 p-3 transition hover:border-teal-200 hover:bg-teal-50"
                >
                  <p className="text-sm font-semibold text-slate-700">{assessment.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <i className="fa-regular fa-clock mr-1" />
                    Opens {formatDateTime(assessment.opensAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Closes {formatDateTime(assessment.closesAt)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="fa-file-circle-check" title="Nothing upcoming" />
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {isAdmin && stats ? (
          <Card title="Accounts by role" subtitle="System user distribution">
            <BarChart
              data={Object.entries(stats.users).map(([label, value]) => ({
                label,
                value,
              }))}
              color="bg-purple-600"
            />
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <span>
                <i className="fa-solid fa-book mr-1 text-teal-600" />
                {stats.courses} courses
              </span>
              <span>
                <i className="fa-solid fa-file-signature mr-1 text-amber-500" />
                {stats.assessments} assessments
              </span>
              <span>
                <i className="fa-solid fa-pen-to-square mr-1 text-emerald-600" />
                {stats.attempts} attempts
              </span>
              <span>
                <i className="fa-solid fa-qrcode mr-1 text-purple-600" />
                {stats.attendanceCheckins} check-ins
              </span>
            </div>
          </Card>
        ) : (
          <Card
            title="My courses"
            subtitle={isStudent ? "Current enrolments" : "Courses you manage or assist"}
          >
            {dashboard.courses.length ? (
              <div className="space-y-2">
                {dashboard.courses.slice(0, 6).map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 hover:border-teal-200 hover:bg-teal-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {course.code} — {course.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {course.term} · {formatDate(course.startDate)} to{" "}
                        {formatDate(course.endDate)}
                      </p>
                    </div>
                    <Badge
                      tone={course.role === "teacher" ? "teacher" : course.role || "student"}
                    >
                      {course.role}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="fa-book-open"
                title="No courses yet"
                description="You will see enrolled courses here."
              />
            )}
          </Card>
        )}

        <Card
          title={isAdmin ? "Recent audit events" : "Latest announcements"}
          subtitle={isAdmin ? "Most recent security and activity events" : "Across your courses"}
        >
          {isAdmin ? (
            stats?.recentEvents?.length ? (
              <div className="space-y-2">
                {stats.recentEvents.map((event: AuditEvent) => (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold capitalize text-slate-700">
                        {event.kind.replaceAll("_", " ")}
                      </p>
                      <p className="text-slate-500">
                        {event.ip || "unknown IP"} · {relativeTime(event.createdAt)}
                      </p>
                    </div>
                    <Badge tone="info">#{event.id}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="fa-clipboard-list" title="No audit events yet" />
            )
          ) : dashboard.announcements.length ? (
            <div className="space-y-3">
              {dashboard.announcements.map((item) => (
                <article key={item.id} className="rounded-md border border-slate-100 p-3">
                  <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {item.author?.name || "Staff"} · {relativeTime(item.createdAt)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon="fa-bullhorn" title="No announcements yet" />
          )}
        </Card>
      </div>

      {isAdmin && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/admin/users", icon: "fa-users", label: "Manage users" },
            { href: "/admin/sessions", icon: "fa-signal", label: "Active sessions" },
            { href: "/admin/ip-blacklist", icon: "fa-ban", label: "IP blacklist" },
            { href: "/admin/audit", icon: "fa-clipboard-list", label: "Audit log" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700",
              )}
            >
              <i className={cn("fa-solid text-teal-600", item.icon)} />
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
