"use client";

import { useI18n } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { language, setLanguage, tr } = useI18n();
  return <label className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 focus-within:ring-2 focus-within:ring-teal-600 sm:px-3">
    <i aria-hidden="true" className="fa-solid fa-globe text-teal-700" />
    <span className="sr-only">{tr("Ngôn ngữ giao diện")}</span>
    <select value={language} onChange={(event) => setLanguage(event.target.value as "vi" | "en")}
      className="min-h-9 cursor-pointer bg-transparent pr-1 outline-none">
      <option value="vi" lang="vi">Tiếng Việt</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>;
}
