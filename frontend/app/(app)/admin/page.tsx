"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { relativeTime } from "../../../lib/format";
import type { Stats } from "../../../lib/types";
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

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading administration overview…" />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!stats) return null;

  const totalUsers = Object.values(stats.users).reduce((sum, value) => sum + value, 0);

  return (
    <div>
      <PageHeader
        icon="fa-shield-halved"
        title="Administration"
        description="Users, sessions, network restrictions and the audit trail."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="fa-users" label="Accounts" value={totalUsers} tone="purple" />
        <StatCard
          icon="fa-signal"
          label="Active sessions"
          value={stats.activeSessions}
          tone="emerald"
        />
        <StatCard icon="fa-book" label="Courses" value={stats.courses} tone="sky" />
        <StatCard
          icon="fa-file-signature"
          label="Assessments"
          value={stats.assessments}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Accounts by role" subtitle="System user distribution">
          <BarChart
            data={Object.entries(stats.users).map(([label, value]) => ({
              label,
              value,
            }))}
            color="bg-purple-600"
          />
        </Card>
        <Card title="Operational counters" subtitle="Activity across the deployment">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon="fa-pen-to-square"
              label="Attempts"
              value={stats.attempts}
              tone="sky"
            />
            <StatCard
              icon="fa-qrcode"
              label="Check-ins"
              value={stats.attendanceCheckins}
              tone="emerald"
            />
            <StatCard
              icon="fa-triangle-exclamation"
              label="Pending leave"
              value={stats.pendingLeave}
              tone="amber"
            />
            <StatCard
              icon="fa-user-clock"
              label="Active sessions"
              value={stats.activeSessions}
              tone="rose"
            />
          </div>
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Recent audit events"
        subtitle="Security-relevant activity across the system"
        actions={
          <Link href="/admin/audit" className="text-xs font-semibold text-teal-700">
            Full audit log <i className="fa-solid fa-arrow-right ml-1" />
          </Link>
        }
      >
        {stats.recentEvents.length ? (
          <div className="space-y-2">
            {stats.recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold capitalize text-slate-700">
                    {event.kind.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.ip || "unknown IP"} · {relativeTime(event.createdAt)}
                  </p>
                </div>
                <Badge tone="info">#{event.id}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="fa-clipboard-list" title="No audit events yet" />
        )}
      </Card>
    </div>
  );
}
