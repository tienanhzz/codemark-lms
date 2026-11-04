"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { Alert, Button, Field, Input } from "../../components/ui";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await login(String(form.get("email") || ""), String(form.get("password") || ""));
      router.replace("/dashboard");
    } catch (err) {
      setError(
        errorMessage(err) === "invalid credentials"
          ? "Invalid email or password."
          : errorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-scene grid min-h-screen bg-[#f5f7fa] lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#102c36] p-10 text-white lg:flex xl:p-16">
        <div aria-hidden="true" className="absolute -right-40 top-1/4 h-[520px] w-[520px] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-24 top-1/3 h-96 w-96 rounded-full border border-white/5 bg-teal-400/5" />
        <div className="login-enter relative">
          <div className="flex items-center gap-3">
            <img src="/branding/logo-dark.svg" alt="CodeMark_ClassFlow — Learning, connected" width={360} height={64} className="h-auto w-full max-w-[320px]" />
          </div>
        </div>
        <div className="login-enter login-enter-intro relative my-16 max-w-lg">
          <p className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-200">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> Your digital classroom
          </p>
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight xl:text-5xl">
            A clearer path to<br />
            <span className="text-teal-200">better learning.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-slate-300">
            Bring your classes, schedules and assessments together.
            Stay organized, follow your progress and focus on what comes next.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            {[
              ["fa-book-open", "Your courses"],
              ["fa-calendar-days", "Your schedule"],
              ["fa-chart-line", "Your progress"],
            ].map(([icon, label]) => (
              <div key={label} className="login-feature">
                <i aria-hidden="true" className={`fa-solid ${icon} text-lg text-teal-200/80`} />
                <p className="mt-3 text-xs text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="login-enter login-enter-footer relative text-xs text-slate-400">
          A shared space for students and educators.
        </p>
      </section>

      <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <form
          onSubmit={onSubmit}
          className="login-enter login-enter-form w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_48px_-20px_rgba(15,23,42,0.2)] sm:p-7"
        >
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/branding/logo.svg" alt="CodeMark_ClassFlow — Learning, connected" width={360} height={64} className="h-auto w-full" />
          </div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">Welcome to ClassFlow</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in to your workspace</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Continue with your school account.
          </p>
          <div className="mt-6 space-y-4">
            <Field label="Email">
              <Input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@school.example"
              />
            </Field>
            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
              />
            </Field>
          </div>
          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}
          <Button type="submit" className="login-submit mt-6 w-full rounded-lg border-teal-800 bg-teal-800 py-2.5 hover:bg-teal-900" loading={submitting}>
            Sign in <i aria-hidden="true" className="fa-solid fa-arrow-right ml-1 text-xs" />
          </Button>
          <p className="mt-5 border-t border-slate-100 pt-4 text-center text-[11px] leading-5 text-slate-500">
            Need access? Contact your school administrator.
          </p>
        </form>
      </section>
    </main>
  );
}
