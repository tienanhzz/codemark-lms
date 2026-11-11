import english from "../locales/en.json";
import vietnamese from "../locales/vi.json";

export type Language = "vi" | "en";
export type TranslationValues = Record<string, string | number | null | undefined>;
export const LANGUAGE_COOKIE = "codemark-language";
export const LOCALES: Record<Language, string> = { vi: "vi-VN", en: "en-US" };

// State messages remain in the source language so changing language also updates
// an error or success message that is already open. Match their placeholders
// without translating names or other values supplied by the user.
const patterns = [...new Set([...Object.keys(english), ...Object.keys(vietnamese)])]
  // Adjacent placeholders cannot be recovered unambiguously from stored text.
  .filter(key => /\{\w+\}/.test(key) && !/\{\w+\}\{\w+\}/.test(key)).map(key => {
  const names: string[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\\{(\w+)\\\}/g, (_, name: string) => {
    names.push(name);
    return "([\\s\\S]*?)";
  });
  return { key, names, pattern: new RegExp(`^${pattern}$`) };
});

export function getLanguage(): Language {
  return typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "vi";
}

export function getLocale(language = getLanguage()) {
  return LOCALES[language];
}

export function translate(message: string, values?: TranslationValues, language = getLanguage()): string {
  const dictionary: Record<string, string> = language === "en" ? english : vietnamese;
  let translated = dictionary[message];
  if (translated === undefined && !values) {
    for (const entry of patterns) {
      const match = entry.pattern.exec(message);
      if (!match) continue;
      translated = dictionary[entry.key] ?? entry.key;
      values = Object.fromEntries(entry.names.map((name, index) => [name, match[index + 1]]));
      break;
    }
  }
  translated ??= message;
  return values ? translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  ) : translated;
}
