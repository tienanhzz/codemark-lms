"use client";
import { useI18n } from "./LanguageProvider";

import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
} from "react";
import { cn, initials } from "../lib/format";
import { createPortal } from "react-dom";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost" | "warning";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-800 text-white hover:bg-teal-900 border-teal-800",
  secondary: "bg-white text-slate-700 hover:bg-slate-50 border-slate-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 border-rose-600",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600",
  warning: "bg-amber-500 text-white hover:bg-amber-600 border-amber-500",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 border-transparent",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  const { tr } = useI18n();
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <i className="fa-solid fa-circle-notch animate-spin" />}
      {typeof children === "string" ? ({admin:tr("Quản trị viên"),teacher:tr("Giảng viên"),ta:tr("Trợ giảng"),student:tr("Sinh viên"),pending:tr("Chờ duyệt"),approved:tr("Đã duyệt"),rejected:tr("Đã từ chối"),quiz:tr("Bài tập"),exam:tr("Bài thi"),assignment:tr("Bài tập"),submitted:tr("Đã nộp"),in_progress:tr("Đang làm"),code:tr("Lập trình"),mcq:tr("Trắc nghiệm"),short:tr("Trả lời ngắn"),draft:tr("Bản nháp"),published:tr("Đã công bố")} as Record<string,string>)[children] || children : children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldClass, className)} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldClass, "min-h-24", className)} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(fieldClass, className)}>
      {children}
    </select>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_20px_-12px_rgba(15,23,42,0.15)]",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName || "p-5"}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  teacher: "bg-teal-100 text-teal-700",
  ta: "bg-cyan-100 text-cyan-700",
  student: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  published: "bg-emerald-100 text-emerald-700",
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
  danger: "bg-rose-100 text-rose-700",
  info: "bg-teal-100 text-teal-700",
};

export function Badge({
  children,
  tone = "info",
  className,
}: {
  children: ReactNode;
  tone?: string;
  className?: string;
}) {
  const { tr } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
        TONES[tone] || TONES.info,
        className,
      )}
    >
      {typeof children === "string" ? ({admin:tr("Quản trị viên"),teacher:tr("Giảng viên"),ta:tr("Trợ giảng"),student:tr("Sinh viên"),pending:tr("Chờ duyệt"),approved:tr("Đã duyệt"),rejected:tr("Đã từ chối"),quiz:tr("Bài tập"),exam:tr("Bài thi"),assignment:tr("Bài tập"),submitted:tr("Đã nộp"),in_progress:tr("Đang làm"),code:tr("Lập trình"),mcq:tr("Trắc nghiệm"),short:tr("Trả lời ngắn"),draft:tr("Bản nháp"),published:tr("Đã công bố")} as Record<string,string>)[children] || children : children}
    </span>
  );
}

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "danger" | "success" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const { tr } = useI18n();
  const tones = {
    info: "border-teal-200 bg-teal-50 text-teal-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", tones[tone], className)}>
      {typeof children === "string" ? tr(children) : children}
    </div>
  );
}

export function Spinner({ label = "Đang tải…" }: { label?: string }) {
  const { tr } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
      <i className="fa-solid fa-circle-notch animate-spin" />
      {tr(label)}
    </div>
  );
}

export function EmptyState({
  icon = "fa-inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <i className={cn("fa-solid text-2xl text-slate-300", icon)} />
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description && <p className="max-w-md text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "sky",
}: {
  icon: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "sky" | "emerald" | "amber" | "rose" | "purple" | "slate";
}) {
  const tones = {
    sky: "bg-teal-50 text-teal-800",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    purple: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.15)]">
      <div
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg",
          tones[tone],
        )}
      >
        <i className={cn("fa-solid", icon)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="truncate text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
  mode = "drawer",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  mode?: "drawer" | "page";
}) {
  const { tr } = useI18n();
  useEffect(() => {
    if (!open || mode !== "page") return;
    document.getElementById("drawer-root")?.scrollIntoView({block:"start"});
    const content = document.getElementById("screen-content");
    if (content) content.hidden = true;
    return () => { if (content) content.hidden = false; };
  }, [open, mode]);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  const panel = (
    <div className="drawer-panel relative z-10 my-4 flex w-full justify-end border-l-4 border-teal-600 bg-teal-50 p-3">
      <div
        className={cn(
          "w-full rounded-2xl border border-slate-200 bg-white shadow-sm",
          width,
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={tr("Đóng")}
          >{tr("Quay lại")}</button>
        </header>
        <div className="p-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
  const root = typeof document !== "undefined" ? document.getElementById("drawer-root") : null;
  return root ? createPortal(panel, root) : panel;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; icon?: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-white p-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          aria-pressed={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
            active === tab.id
              ? "border-teal-100 bg-teal-50 text-teal-800"
              : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
          )}
        >
          {tab.icon && <i className={cn("fa-solid", tab.icon)} />}
          {tr(tab.label)}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, role }: { name?: string; role?: string }) {
  const tone =
    role === "admin"
      ? "bg-purple-600"
      : role === "teacher"
        ? "bg-teal-600"
        : role === "ta"
          ? "bg-cyan-600"
          : "bg-emerald-600";
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white",
        tone,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function BarChart({
  data,
  color = "bg-teal-600",
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span className="font-medium capitalize text-slate-600">{item.label}</span>
            <span>{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-full rounded-full transition-all", color)}
              style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900">
          {icon && <i className={cn("fa-solid text-base text-teal-700", icon)} />}
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
