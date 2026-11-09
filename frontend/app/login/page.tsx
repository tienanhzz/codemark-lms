"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { Alert, Button, Field, Input } from "../../components/ui";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [help, setHelp] = useState<"password" | "support" | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(user.mustChangePassword ? "/account" : "/");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const current = await login(String(form.get("studentId") || ""), String(form.get("password") || ""));
      router.replace(current.mustChangePassword ? "/account" : "/");
    } catch (err) {
      setError(
        errorMessage(err) === "invalid credentials"
          ? "Mã đăng nhập hoặc mật khẩu không đúng."
          : errorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-scene flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 sm:px-6">
      <section aria-label="Đăng nhập CodeMark" className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex text-sm font-medium text-slate-600 hover:text-teal-800">← Quay lại trang chủ</Link>
        <form
          onSubmit={onSubmit}
          className="login-enter login-enter-form w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"
        >
          <div className="mb-7 flex justify-center">
            <img src="/branding/logo.svg" alt="CodeMark — Kết nối học tập" width={360} height={64} className="h-auto w-56 max-w-full" />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Chào mừng trở lại</h1>
          <p className="mt-2 text-center text-sm leading-6 text-slate-500">
            Sử dụng mã đăng nhập 10 chữ số của trường.
          </p>
          <div className="mt-6 space-y-4">
            <Field label="Mã đăng nhập">
              <Input
                name="studentId"
                type="text" inputMode="numeric" pattern="[0-9]{10}" maxLength={10}
                autoComplete="username"
                required
                placeholder="2025000001"
              />
            </Field>
            <Field label="Mật khẩu">
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
            <div role="alert"><Alert tone="danger" className="mt-4">
              {error}
            </Alert></div>
          )}
          <Button type="submit" className="login-submit mt-6 w-full rounded-lg border-teal-800 bg-teal-800 py-2.5 hover:bg-teal-900" loading={submitting}>
            Đăng nhập <i aria-hidden="true" className="fa-solid fa-arrow-right ml-1 text-xs" />
          </Button>
          <p className="mt-5 border-t border-slate-100 pt-4 text-center text-[11px] leading-5 text-slate-500">
            Liên hệ quản trị viên của trường để được cấp tài khoản.
          </p>
        </form>
        <div className="mt-5 flex items-center justify-center gap-5 text-sm">
          <button type="button" aria-expanded={help === "password"} aria-controls="login-help" onClick={() => setHelp(help === "password" ? null : "password")} className="rounded text-teal-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">Quên mật khẩu?</button>
          <span aria-hidden="true" className="h-4 border-l border-slate-300"/>
          <button type="button" aria-expanded={help === "support"} aria-controls="login-help" onClick={() => setHelp(help === "support" ? null : "support")} className="rounded text-slate-600 hover:text-teal-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">Cần hỗ trợ?</button>
        </div>
        <div id="login-help" aria-live="polite">
          {help && <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600" aria-labelledby="login-help-title">
            <h2 id="login-help-title" className="mb-2 font-semibold text-slate-900">{help === "password" ? "Cấp lại mật khẩu" : "Hỗ trợ đăng nhập"}</h2>
            {help === "password" ? <>
              <p>Liên hệ quản trị viên của trường để xác minh tài khoản và được cấp lại mật khẩu.</p>
              <p className="mt-2">Chuẩn bị họ tên, mã đăng nhập 10 chữ số và thông tin lớp. Sau khi nhận mật khẩu mới, đăng nhập và đổi mật khẩu theo hướng dẫn của hệ thống.</p>
            </> : <>
              <p>Kiểm tra mã đăng nhập đủ 10 chữ số, phím Caps Lock và kết nối mạng.</p>
              <p className="mt-2">Nếu chưa được cấp tài khoản hoặc vẫn không đăng nhập được, liên hệ giảng viên phụ trách lớp hoặc bộ phận quản trị hệ thống của trường. Cung cấp mã đăng nhập và nội dung lỗi để được hỗ trợ.</p>
            </>}
            <p className="mt-2 text-xs text-slate-500">Không gửi mật khẩu của bạn khi yêu cầu hỗ trợ.</p>
            <button type="button" onClick={() => setHelp(null)} className="mt-3 font-medium text-teal-800 hover:underline">Đóng hướng dẫn</button>
          </section>}
        </div>
      </section>
    </main>
  );
}
