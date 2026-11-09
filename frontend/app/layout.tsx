import type { Metadata } from "next";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import { Providers } from "../components/Providers";

export const metadata: Metadata = {
  title: "CodeMark_ClassFlow",
  description: "Hệ thống quản lý học tập và xếp hạng sinh viên",
  icons: {
    icon: "/branding/favicon.ico",
    shortcut: "/branding/favicon.ico",
    apple: "/branding/android-chrome-512x512.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="bg-slate-100 text-slate-800 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
