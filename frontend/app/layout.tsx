import type { Metadata } from "next";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import { Providers } from "../components/Providers";

export const metadata: Metadata = {
  title: "CodeMark_ClassFlow",
  description: "Secure Learning Management System for classrooms",
  icons: {
    icon: "/branding/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-800 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
