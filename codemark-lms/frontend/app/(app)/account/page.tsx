"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { roleLabel } from "../../../lib/format";
import { useAuth } from "../../../components/AuthProvider";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  StatCard,
} from "../../../components/ui";

const MIN_PASSWORD = 12;

export default function AccountPage() {
  const { user, refresh, passwordReminder } = useAuth();
  const reminderRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (user?.mustChangePassword && passwordReminder) {
      reminderRef.current?.focus({ preventScroll: true });
      reminderRef.current?.scrollIntoView({ block: "center" });
    }
  }, [user?.mustChangePassword, passwordReminder]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") || "");
    const newPassword = String(values.get("newPassword") || "");
    const confirmPassword = String(values.get("confirmPassword") || "");

    setError("");
    setNotice("");

    if (newPassword.length < MIN_PASSWORD) {
      setError(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới và xác nhận không khớp.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }

    setSaving(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      form.reset();
      await refresh();
      setNotice("Đã đổi mật khẩu thành công.");
    } catch (err) {
      setError(
        errorMessage(err) === "invalid current password"
          ? "Mật khẩu hiện tại không chính xác."
          : errorMessage(err) === "weak password"
            ? `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự.`
            : errorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon="fa-user-gear"
        title="Tài khoản của tôi"
        description="Xem thông tin tài khoản và đổi mật khẩu."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon="fa-id-badge"
          label="Họ tên"
          value={user.name}
          hint={
            <>
              <i className="fa-solid fa-at mr-1" />
              {user.studentId}
            </>
          }
          tone="sky"
        />
        <StatCard
          icon="fa-shield-halved"
          label="Vai trò hệ thống"
          value={roleLabel(user.role)}
          hint="Do quản trị viên cấp"
          tone="purple"
        />
      </div>

      <Card
        className="mt-5"
        title="Đổi mật khẩu"
        subtitle={`Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự. Phiên đăng nhập vẫn được giữ sau khi đổi mật khẩu.`}
      >
        {user.mustChangePassword && (
          <div ref={reminderRef} tabIndex={-1} role="alert" className="mb-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <Alert tone="warning">
              {passwordReminder
                ? `Bạn cần đổi mật khẩu lần đầu trước khi sử dụng chức năng “${passwordReminder.feature}”. Vui lòng hoàn tất đổi mật khẩu bên dưới.`
                : "Tài khoản mới cần đổi mật khẩu lần đầu trước khi sử dụng các chức năng khác."}
            </Alert>
          </div>
        )}
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <Field label="Mật khẩu hiện tại" className="sm:col-span-2">
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Mật khẩu mới">
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
            />
          </Field>
          {error && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          {notice && (
            <div className="sm:col-span-2">
              <Alert tone="success">{notice}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              <i className="fa-solid fa-key" /> Cập nhật mật khẩu
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-5" title="Bảo mật phiên đăng nhập" subtitle="Cách hệ thống bảo vệ tài khoản của bạn">
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <i className="fa-solid fa-circle-check mt-1 text-emerald-500" />
            Mỗi tài khoản chỉ có một phiên hoạt động. Đăng nhập nơi khác sẽ thu hồi phiên cũ và ghi nhật ký.
          </li>
          <li className="flex items-start gap-2">
            <i className="fa-solid fa-circle-check mt-1 text-emerald-500" />
            Phiên hết hạn sau hai phút không hoạt động.
          </li>
          <li className="flex items-start gap-2">
            <i className="fa-solid fa-circle-check mt-1 text-emerald-500" />
            Mật khẩu được băm một chiều và không được trả về qua API.
          </li>
        </ul>
      </Card>
    </div>
  );
}
