"use client";
import { useI18n } from "../../../../components/LanguageProvider";

import { confirmInline } from "../../../../components/InlineConfirm";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../../../lib/api";
import { formatDateTime } from "../../../../lib/format";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "../../../../components/ui";

type NetworkRow = {
  id: number;
  network: string;
  reason: string;
  createdAt: string;
};

export default function BlacklistPage() {
  const { tr, locale } = useI18n();
  const [networks, setNetworks] = useState<NetworkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ networks: NetworkRow[] }>("/api/admin/ip-blacklist");
      setNetworks(data.networks);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/ip-blacklist", {
        method: "POST",
        body: { network: form.get("network"), reason: form.get("reason") },
      });
      (event.target as HTMLFormElement).reset();
      setNotice("Đã thêm địa chỉ mạng vào danh sách chặn.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: NetworkRow) {
    if (!await confirmInline(`Remove ${row.network} from the blacklist?`)) return;
    try {
      await api(`/api/admin/ip-blacklist/${row.id}`, { method: "DELETE" });
      setNotice("Đã gỡ chặn địa chỉ mạng.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        icon="fa-ban"
        title={tr("Danh sách IP bị chặn toàn hệ thống")}
        description={tr("Địa chỉ IP và dải CIDR trong danh sách không thể đăng nhập hoặc kết nối hệ thống.")}
      />
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      <Card title={tr("Thêm địa chỉ mạng")} subtitle={tr("Nhập địa chỉ IP hoặc dải CIDR")}>
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
          <Field label={tr("IP hoặc CIDR")}>
            <Input name="network" required placeholder="203.0.113.0/24" />
          </Field>
          <Field label={tr("Lý do")}>
            <Input name="reason" placeholder={tr("Lý do chặn…")} maxLength={250} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="danger" loading={saving} className="w-full">
              <i className="fa-solid fa-ban" />{" " + tr("Chặn địa chỉ mạng")}</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4" title={tr("Địa chỉ mạng bị chặn")} bodyClassName="p-0">
        {loading ? (
          <Spinner label={tr("Đang tải danh sách chặn…")} />
        ) : networks.length ? (
          <div className="divide-y divide-slate-50">
            {networks.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-700">
                    {row.network}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.reason || tr("No reason recorded")}{" " + tr("· thêm lúc")}{" "}
                    {formatDateTime(row.createdAt, locale)}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => remove(row)}>
                  <i className="fa-solid fa-trash text-rose-500" />{" " + tr("Gỡ bỏ")}</Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              icon="fa-shield-halved"
              title={tr("Chưa có địa chỉ mạng bị chặn")}
              description={tr("Dùng danh sách này để chặn địa chỉ mạng trên toàn hệ thống.")}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
