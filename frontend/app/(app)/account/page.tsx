"use client";

import { FormEvent, useState } from "react";
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
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      setError(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a new password that differs from the current one.");
      return;
    }

    setSaving(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      form.reset();
      setNotice("Password updated. Keep your new password somewhere safe.");
    } catch (err) {
      setError(
        errorMessage(err) === "invalid current password"
          ? "Your current password is incorrect."
          : errorMessage(err) === "weak password"
            ? `New password must be at least ${MIN_PASSWORD} characters.`
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
        title="My account"
        description="Review your identity and rotate your password."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon="fa-id-badge"
          label="Display name"
          value={user.name}
          hint={
            <>
              <i className="fa-solid fa-at mr-1" />
              {user.email}
            </>
          }
          tone="sky"
        />
        <StatCard
          icon="fa-shield-halved"
          label="System role"
          value={roleLabel(user.role)}
          hint="Issued by an administrator"
          tone="purple"
        />
      </div>

      <Card
        className="mt-5"
        title="Change password"
        subtitle={`Use at least ${MIN_PASSWORD} characters. Changing your password keeps this session active.`}
      >
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password" className="sm:col-span-2">
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password">
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
            />
          </Field>
          <Field label="Confirm new password">
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
              <i className="fa-solid fa-key" /> Update password
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-5" title="Session security" subtitle="How this deployment protects your account">
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <i className="fa-solid fa-circle-check mt-1 text-emerald-500" />
            Only one active session is allowed; signing in elsewhere revokes the previous
            session and is audited.
          </li>
          <li className="flex items-start gap-2">
            <i className="fa-solid fa-circle-check mt-1 text-emerald-500" />
            Sessions expire after two minutes without authenticated HTTP or WebSocket
            activity.
          </li>
          <li className="flex items-start gap-2">
            <i className="fa-solid fa-circle-check mt-1 text-emerald-500" />
            Your password is stored as a one-way hash and is never returned by the API.
          </li>
        </ul>
      </Card>
    </div>
  );
}
