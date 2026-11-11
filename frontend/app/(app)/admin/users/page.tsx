"use client";
import { useI18n } from "../../../../components/LanguageProvider";

import { confirmInline } from "../../../../components/InlineConfirm";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../../../lib/api";
import { formatDateTime, roleLabel } from "../../../../lib/format";
import type { Role, User } from "../../../../lib/types";
import { useAuth } from "../../../../components/AuthProvider";
import { BulkAccountForm } from "../../../../components/admin/BulkAccountForm";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Drawer,
  PageHeader,
  Select,
  Spinner,
} from "../../../../components/ui";

const ROLES: Role[] = ["admin", "teacher", "ta", "student"];

export default function AdminUsersPage() {
  const { tr, language, locale } = useI18n();
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
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");
  const [editing, setEditing] = useState<User | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("create") === "bulk") {
      setCreateMode("bulk");
      setCreateOpen(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
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
          name: form.get("name"),
          studentId: form.get("studentId"),
          role: form.get("role"),
          password: form.get("password"),
        },
      });
      setCreateOpen(false);
      setNotice("Đã tạo tài khoản.");
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
          studentId: form.get("studentId"),
          name: form.get("name"),
          role: form.get("role"),
          password: form.get("password") || undefined,
        },
      });
      setEditing(null);
      setNotice("Đã cập nhật tài khoản.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: User) {
    if (!await confirmInline(`Delete ${target.name} (${target.studentId})?`)) return;
    setError("");
    try {
      await api(`/api/users/${target.id}`, { method: "DELETE" });
      setNotice("Đã xóa tài khoản.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        icon="fa-users"
        title={tr("Tài khoản")}
        description={tr("Tạo tài khoản và phân vai trò. Mỗi tài khoản có một phiên hoạt động.")}
        actions={
          <Button onClick={() => { setCreateMode("single"); setCreateOpen(true); }}>
            <i className="fa-solid fa-user-plus" />{" " + tr("Thêm tài khoản")}</Button>
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
            placeholder={tr("Tìm tên hoặc mã đăng nhập")}
            className="pl-8"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="w-44"
        >
          <option value="">{tr("Tất cả vai trò")}</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role, language)}
            </option>
          ))}
        </Select>
        <span className="text-xs text-slate-500">{total}{" " + tr("tài khoản")}</span>
      </div>

      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner label={tr("Đang tải tài khoản…")} />
        ) : users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">{tr("Tài khoản")}</th>
                  <th className="px-4 py-3">{tr("Vai trò")}</th>
                  <th className="px-4 py-3">{tr("Đã tạo")}</th>
                  <th className="px-4 py-3 text-right">{tr("Thao tác")}</th>
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
                              <span className="ml-1 text-[10px] text-slate-400">{tr("(bạn)")}</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{user.studentId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={user.role}>{roleLabel(user.role, language)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime((user as User & { createdAt?: string }).createdAt, locale)}
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
            <EmptyState icon="fa-users" title={tr("Không có tài khoản phù hợp")} />
          </div>
        )}
      </Card>

      <Drawer
        open={createOpen}
        mode="page"
        width="max-w-4xl"
        onClose={() => setCreateOpen(false)}
        title={tr("Thêm tài khoản")}
        footer={createMode === "single" ?
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{tr("Hủy")}</Button>
            <Button type="submit" form="create-user-form" loading={saving}>{tr("Tạo tài khoản")}</Button>
          </> : undefined
        }
      >
        <nav className="mb-5 flex flex-wrap gap-2" aria-label={tr("Cách thêm tài khoản")}>
          <Button variant={createMode === "single" ? "primary" : "secondary"} aria-pressed={createMode === "single"} onClick={() => setCreateMode("single")}>{tr("Tạo một tài khoản")}</Button>
          <Button variant={createMode === "bulk" ? "primary" : "secondary"} aria-pressed={createMode === "bulk"} onClick={() => setCreateMode("bulk")}>{tr("Tạo tài khoản hàng loạt")}</Button>
        </nav>
        {createMode === "bulk" ? <BulkAccountForm onCreated={load} /> :
        <form id="create-user-form" onSubmit={create} className="space-y-3">
          <Field label={tr("Họ tên")}>
            <Input name="name" required />
          </Field>
          <Field label={tr("Mã đăng nhập")}>
            <Input name="studentId" type="text" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required />
          </Field>
          <Field label={tr("Vai trò")}>
            <Select name="role" defaultValue="student">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role, language)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr("Mật khẩu")} hint={tr("Tối thiểu 12 ký tự, tối đa 72 byte UTF-8. Tài khoản phải đổi mật khẩu lần đầu.")}>
            <Input name="password" type="password" required minLength={12} />
          </Field>
        </form>}
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={tr("Edit {0}", { 0: (editing?.name || "account") })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{tr("Hủy")}</Button>
            <Button type="submit" form="edit-user-form" loading={saving}>{tr("Lưu thay đổi")}</Button>
          </>
        }
      >
        {editing && (
          <form id="edit-user-form" onSubmit={update} className="space-y-3">
            <Field label={tr("Họ tên")}>
              <Input name="name" defaultValue={editing.name} required />
            </Field>
            <Field label={tr("Mã đăng nhập")}>
              <Input name="studentId" defaultValue={editing.studentId || ""} pattern="[0-9]{10}" maxLength={10} required />
            </Field>
            <Field label={tr("Vai trò")}>
              <Select name="role" defaultValue={editing.role}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role, language)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={tr("Đặt lại mật khẩu")}
              hint={tr("Để trống để giữ mật khẩu hiện tại. Đổi mật khẩu sẽ thu hồi phiên đăng nhập.")}
            >
              <Input name="password" type="password" minLength={12} />
            </Field>
          </form>
        )}
      </Drawer>
    </div>
  );
}
