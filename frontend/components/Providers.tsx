"use client";

import { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { LanguageProvider } from "./LanguageProvider";
import type { Language } from "../lib/i18n";

export function Providers({ children, language }: { children: ReactNode; language: Language }) {
  return <LanguageProvider initialLanguage={language}><AuthProvider>{children}</AuthProvider></LanguageProvider>;
}
