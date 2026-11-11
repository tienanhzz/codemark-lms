"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { LANGUAGE_COOKIE, Language, LOCALES, translate, TranslationValues } from "../lib/i18n";

type LanguageContextValue = {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  tr: (message: string, values?: TranslationValues) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage: Language }) {
  const [language, updateLanguage] = useState(initialLanguage);
  const setLanguage = useCallback((next: Language) => {
    if (next !== "vi" && next !== "en") return;
    document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    updateLanguage(next);
  }, []);
  const value = useMemo(() => ({
    language,
    locale: LOCALES[language],
    setLanguage,
    tr: (message: string, values?: TranslationValues) => translate(message, values, language),
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useI18n must be used within LanguageProvider");
  return context;
}
