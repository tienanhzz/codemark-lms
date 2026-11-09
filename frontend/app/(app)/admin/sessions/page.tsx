"use client";
import { confirmInline } from "../../../../components/InlineConfirm";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../../../lib/api";
import { formatDateTime, roleLabel } from "../../../../lib/format";
import type { Role } from "../../../../lib/types";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from "../../../../components/ui";

type SessionRow = {
  id: number;
  name: string;
  studentId: string;
  role: Role;
  ip: string | null;
  userAgent: string | null;
  lastActivity: string | null;
};

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ sessions: SessionRow[] }>("/api/admin/sessions");
      setSessions(data.sessions);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function revoke(row: SessionRow) {
    if (!await confirmInline(`Revoke the active session for ${row.name}?`)) return;
    setError("");
    try {
      await api(`/api/admin/sessions/${row.id}`, { method: "DELETE" });
      setNotice(`Đã thu hồi phiên của ${row.name}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        icon="fa-signal"
        title="Phiên hoạt động"
        description="Mỗi tài khoản có một phiên đăng nhập. Phiên hết hạn sau 2 phút không hoạt động."
        actions={
          <Button variant="secondary" onClick={load}>
            <i className="fa-solid fa-rotate" /> Làm mới
          </Button>
        }
      />
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      <Card bodyClassName="p-0">
        {loading && sessions.length === 0 ? (
          <Spinner label="Đang tải phiên…" />
        ) : sessions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Tài khoản</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Hoạt động gần nhất</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sessions.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.name} role={row.role} />
                        <div>
                          <p className="font-medium text-slate-700">{row.name}</p>
                          <p className="text-xs text-slate-400">{row.studentId}</p>
                          <p className="max-w-xs truncate text-[10px] text-slate-300">
                            {row.userAgent || "unknown user agent"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.role}>{roleLabel(row.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {row.ip || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(row.lastActivity)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="danger" onClick={() => revoke(row)}>
                        <i className="fa-solid fa-power-off" /> Thu hồi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              icon="fa-signal"
              title="Không có phiên hoạt động"
              description="Phiên xuất hiện sau khi đăng nhập thành công."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
