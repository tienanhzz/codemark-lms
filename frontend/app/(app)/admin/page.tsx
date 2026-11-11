"use client";
import { useI18n } from "../../../components/LanguageProvider";

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
  const { tr, locale } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label={tr("Đang tải trang quản trị…")} />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!stats) return null;

  const totalUsers = Object.values(stats.users).reduce((sum, value) => sum + value, 0);

  return (
    <div>
      <PageHeader
        icon="fa-shield-halved"
        title={tr("Quản trị")}
        description={tr("Tài khoản, phiên đăng nhập, chặn mạng và nhật ký hoạt động.")}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="fa-users" label={tr("Tài khoản")} value={totalUsers} tone="purple" />
        <StatCard
          icon="fa-signal"
          label={tr("Phiên hoạt động")}
          value={stats.activeSessions}
          tone="emerald"
        />
        <StatCard icon="fa-book" label={tr("Lớp học")} value={stats.courses} tone="sky" />
        <StatCard
          icon="fa-file-signature"
          label={tr("Bài tập và bài thi")}
          value={stats.assessments}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title={tr("Tài khoản theo vai trò")} subtitle={tr("Phân bố vai trò người dùng")}>
          <BarChart
            data={Object.entries(stats.users).map(([label, value]) => ({
              label,
              value,
            }))}
            color="bg-purple-600"
          />
        </Card>
        <Card title={tr("Số liệu hoạt động")} subtitle={tr("Hoạt động trên toàn hệ thống")}>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon="fa-pen-to-square"
              label={tr("Lượt làm bài")}
              value={stats.attempts}
              tone="sky"
            />
            <StatCard
              icon="fa-qrcode"
              label={tr("Lượt điểm danh")}
              value={stats.attendanceCheckins}
              tone="emerald"
            />
            <StatCard
              icon="fa-triangle-exclamation"
              label={tr("Đơn nghỉ chờ duyệt")}
              value={stats.pendingLeave}
              tone="amber"
            />
            <StatCard
              icon="fa-user-clock"
              label={tr("Phiên hoạt động")}
              value={stats.activeSessions}
              tone="rose"
            />
          </div>
        </Card>
      </div>

      <Card
        className="mt-5"
        title={tr("Nhật ký gần đây")}
        subtitle={tr("Hoạt động bảo mật trên toàn hệ thống")}
        actions={
          <Link href="/admin/audit" className="text-xs font-semibold text-teal-700">{tr("Nhật ký đầy đủ") + " "}<i className="fa-solid fa-arrow-right ml-1" />
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
                    {event.ip || tr("unknown IP")} · {relativeTime(event.createdAt, locale)}
                  </p>
                </div>
                <Badge tone="info">#{event.id}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="fa-clipboard-list" title={tr("Chưa có nhật ký")} />
        )}
      </Card>
    </div>
  );
}
