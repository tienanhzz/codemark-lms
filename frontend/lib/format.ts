import { getLanguage, getLocale, Language, translate } from "./i18n";

export const WEEKDAYS = [
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
  "Chủ nhật",
];

export const WEEKDAYS_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function weekdayName(index: number, language: Language = getLanguage()) {
  return translate(WEEKDAYS[index] || "Chưa xác định", undefined, language);
}

export function formatDate(value?: string | null, locale = getLocale()) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value?: string | null, locale = getLocale()) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 5);
}

export function relativeTime(value: string, locale = getLocale()) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return translate("vừa xong", undefined, locale.startsWith("en") ? "en" : "vi");
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.round(hours / 24), "day");
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function roleLabel(role?: string | null, language: Language = getLanguage()) {
  if (!role) return "—";
  return translate(({admin:"Quản trị viên",teacher:"Giảng viên",student:"Sinh viên",ta:"Trợ giảng"} as Record<string,string>)[role] || role, undefined, language);
}

export function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function countdown(target: string, nowMs = Date.now()) {
  const diff = new Date(target).getTime() - nowMs;
  const total = Math.max(0, Math.floor(diff / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return {
    expired: diff <= 0,
    total,
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0",
    )}:${String(seconds).padStart(2, "0")}`,
  };
}
