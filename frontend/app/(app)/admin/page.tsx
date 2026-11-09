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

  if (loading) return <Spinner label="Đang tải trang quản trị…" />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!stats) return null;

  const totalUsers = Object.values(stats.users).reduce((sum, value) => sum + value, 0);

  return (
    <div>
      <PageHeader
        icon="fa-shield-halved"
        title="Quản trị"
        description="Tài khoản, phiên đăng nhập, chặn mạng và nhật ký hoạt động."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="fa-users" label="Tài khoản" value={totalUsers} tone="purple" />
        <StatCard
          icon="fa-signal"
          label="Phiên hoạt động"
          value={stats.activeSessions}
          tone="emerald"
        />
        <StatCard icon="fa-book" label="Lớp học" value={stats.courses} tone="sky" />
        <StatCard
          icon="fa-file-signature"
          label="Bài tập và bài thi"
          value={stats.assessments}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Tài khoản theo vai trò" subtitle="Phân bố vai trò người dùng">
          <BarChart
            data={Object.entries(stats.users).map(([label, value]) => ({
              label,
              value,
            }))}
            color="bg-purple-600"
          />
        </Card>
        <Card title="Số liệu hoạt động" subtitle="Hoạt động trên toàn hệ thống">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon="fa-pen-to-square"
              label="Lượt làm bài"
              value={stats.attempts}
              tone="sky"
            />
            <StatCard
              icon="fa-qrcode"
              label="Lượt điểm danh"
              value={stats.attendanceCheckins}
              tone="emerald"
            />
            <StatCard
              icon="fa-triangle-exclamation"
              label="Đơn nghỉ chờ duyệt"
              value={stats.pendingLeave}
              tone="amber"
            />
            <StatCard
              icon="fa-user-clock"
              label="Phiên hoạt động"
              value={stats.activeSessions}
              tone="rose"
            />
          </div>
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Nhật ký gần đây"
        subtitle="Hoạt động bảo mật trên toàn hệ thống"
        actions={
          <Link href="/admin/audit" className="text-xs font-semibold text-teal-700">
            Nhật ký đầy đủ <i className="fa-solid fa-arrow-right ml-1" />
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
          <EmptyState icon="fa-clipboard-list" title="Chưa có nhật ký" />
        )}
      </Card>
    </div>
  );
}
