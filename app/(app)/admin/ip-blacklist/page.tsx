"use client";

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
      setNotice("Network added to the global blacklist.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: NetworkRow) {
    if (!confirm(`Remove ${row.network} from the blacklist?`)) return;
    try {
      await api(`/api/admin/ip-blacklist/${row.id}`, { method: "DELETE" });
      setNotice("Network removed from the blacklist.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        icon="fa-ban"
        title="Global IP blacklist"
        description="Individual IPs and CIDR networks are denied HTTP login/API and WebSocket connections."
      />
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      <Card title="Add network" subtitle="Use an individual address or CIDR range">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
          <Field label="IP or CIDR">
            <Input name="network" required placeholder="203.0.113.0/24" />
          </Field>
          <Field label="Reason">
            <Input name="reason" placeholder="Abuse, classroom policy…" maxLength={250} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="danger" loading={saving} className="w-full">
              <i className="fa-solid fa-ban" /> Block network
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4" title="Blacklisted networks" bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading blacklist…" />
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
                    {row.reason || "No reason recorded"} · added{" "}
                    {formatDateTime(row.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => remove(row)}>
                  <i className="fa-solid fa-trash text-rose-500" /> Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              icon="fa-shield-halved"
              title="No blacklisted networks"
              description="Use this list to block abusive or non-classroom networks globally."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
