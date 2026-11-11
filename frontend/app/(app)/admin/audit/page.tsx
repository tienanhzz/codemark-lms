"use client";
import { useI18n } from "../../../../components/LanguageProvider";

import { useCallback, useEffect, useState } from "react";
import { api, download, errorMessage } from "../../../../lib/api";
import { formatDateTime } from "../../../../lib/format";
import type { AuditEvent } from "../../../../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "../../../../components/ui";

const KINDS = [
  "",
  "login",
  "login_rejected",
  "logout",
  "session_expired",
  "session_revoked",
  "user_created",
  "user_updated",
  "user_deleted",
  "course_created",
  "course_updated",
  "course_deleted",
  "assessment_created",
  "attempt_started",
  "attempt_submitted",
  "attempt_submit_rejected",
  "attendance_checkin",
  "attendance_rejected",
  "leave_requested",
  "leave_decided",
  "ip_blacklisted",
  "socket_connected",
  "proctor_telemetry",
  "proctor_report_exported",
  "audit_export",
];

export default function AuditPage() {
  const { tr, locale } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState("");
  const [limit, setLimit] = useState("100");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit });
      if (kind) params.set("kind", kind);
      const data = await api<{ total: number; events: AuditEvent[] }>(
        `/api/admin/audit?${params.toString()}`,
      );
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [kind, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        icon="fa-clipboard-list"
        title={tr("Nhật ký hoạt động")}
        description={tr("Nhật ký bảo mật và hoạt động chỉ được thêm. Dữ liệu giám sát cần được lưu giữ theo quy định của trường.")}
        actions={
          <>
            <Button variant="secondary" onClick={load}>
              <i className="fa-solid fa-rotate" />{" " + tr("Làm mới")}</Button>
            <Button
              variant="secondary"
              onClick={() =>
                download("/api/admin/audit/export", "audit-log.csv").catch((err) =>
                  setError(errorMessage(err)),
                )
              }
            >
              <i className="fa-solid fa-download" />{" " + tr("Xuất CSV")}</Button>
          </>
        }
      />
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="w-56"
        >
          {KINDS.map((item) => (
            <option key={item || "all"} value={item}>
              {item ? item.replaceAll("_", " ") : tr("All event kinds")}
            </option>
          ))}
        </Select>
        <Select
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          className="w-36"
        >
          <option value="50">{tr("50 sự kiện")}</option>
          <option value="100">{tr("100 sự kiện")}</option>
          <option value="200">{tr("200 sự kiện")}</option>
        </Select>
        <span className="text-xs text-slate-500">{total}{" " + tr("sự kiện phù hợp")}</span>
      </div>

      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label={tr("Đang tải sự kiện nhật ký…")} />
        ) : events.length ? (
          <div className="divide-y divide-slate-50">
            {events.map((event) => (
              <details key={event.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold capitalize text-slate-700">
                      {event.kind.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(event.createdAt, locale)}{" " + tr("· người thực hiện") + " "}{event.actorId ?? tr("system")} ·{" "}
                      {event.ip || tr("unknown IP")}
                    </p>
                  </div>
                  <Badge tone="info">#{event.id}</Badge>
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                  {JSON.stringify(event.detail, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState icon="fa-clipboard-list" title={tr("Chưa có sự kiện phù hợp nhật ký")} />
          </div>
        )}
      </Card>
    </div>
  );
}
