"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../../../lib/api";
import { formatDateTime, roleLabel } from "../../../../lib/format";
import type { Role, User } from "../../../../lib/types";
import { useAuth } from "../../../../components/AuthProvider";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from "../../../../components/ui";

const ROLES: Role[] = ["admin", "teacher", "ta", "student"];

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search.trim()) params.set("q", search.trim());
      if (roleFilter) params.set("role", roleFilter);
      const data = await api<{ total: number; users: User[] }>(
        `/api/users?${params.toString()}`,
      );
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          email: form.get("email"),
          name: form.get("name"),
          role: form.get("role"),
          password: form.get("password"),
        },
      });
      setCreateOpen(false);
      setNotice("Account created.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(`/api/users/${editing.id}`, {
        method: "PATCH",
        body: {
          name: form.get("name"),
          role: form.get("role"),
          password: form.get("password") || undefined,
        },
      });
      setEditing(null);
      setNotice("Account updated.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: User) {
    if (!confirm(`Delete ${target.name} (${target.email})?`)) return;
    setError("");
    try {
      await api(`/api/users/${target.id}`, { method: "DELETE" });
      setNotice("Account deleted.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        icon="fa-users"
        title="Users"
        description="Provision accounts and assign platform roles. Every account has one active session."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <i className="fa-solid fa-user-plus" /> New account
          </Button>
        }
      />

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            className="pl-8"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="w-44"
        >
          <option value="">All roles</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </Select>
        <span className="text-xs text-slate-500">{total} accounts</span>
      </div>

      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label="Loading accounts…" />
        ) : users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={user.name} role={user.role} />
                        <div>
                          <p className="font-medium text-slate-700">
                            {user.name}
                            {user.id === me?.id && (
                              <span className="ml-1 text-[10px] text-slate-400">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={user.role}>{roleLabel(user.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime((user as User & { createdAt?: string }).createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditing(user)}
                        >
                          <i className="fa-solid fa-pen" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={user.id === me?.id}
                          onClick={() => remove(user)}
                        >
                          <i className="fa-solid fa-trash text-rose-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState icon="fa-users" title="No accounts match" />
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" loading={saving}>
              Create account
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={create} className="space-y-3">
          <Field label="Display name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue="student">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Password" hint="Minimum 12 characters. Never use a default password.">
            <Input name="password" type="password" required minLength={12} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name || "account"}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-user-form" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {editing && (
          <form id="edit-user-form" onSubmit={update} className="space-y-3">
            <Field label="Display name">
              <Input name="name" defaultValue={editing.name} required />
            </Field>
            <Field label="Email">
              <Input value={editing.email} disabled />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue={editing.role}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Reset password"
              hint="Leave blank to keep the current password. Changing it revokes the active session."
            >
              <Input name="password" type="password" minLength={12} />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
}
