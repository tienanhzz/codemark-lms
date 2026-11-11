import type { Metadata } from "next";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import { Providers } from "../components/Providers";
import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, translate } from "../lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const language = (await cookies()).get(LANGUAGE_COOKIE)?.value === "en" ? "en" : "vi";
  return {
    title: "CodeMark_ClassFlow",
    description: translate("Hệ thống quản lý học tập và xếp hạng sinh viên", undefined, language),
    icons: {
      icon: "/branding/favicon.ico",
      shortcut: "/branding/favicon.ico",
      apple: "/branding/android-chrome-512x512.png",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const language = (await cookies()).get(LANGUAGE_COOKIE)?.value === "en" ? "en" : "vi";
  return (
    // Browsers/extensions may add root attributes (e.g. class="mdl-js") before React loads.
    // Limit suppression to <html>; hydration mismatches inside the app remain visible.
    <html lang={language} suppressHydrationWarning>
      <body className="bg-slate-100 text-slate-800 antialiased">
        <Providers language={language}>{children}</Providers>
      </body>
    </html>
  );
}
