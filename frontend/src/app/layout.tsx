import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP, Fira_Code } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

const notoSerifJP = Noto_Serif_JP({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  display: "swap",
});

const firaCode = Fira_Code({
  weight: ["300", "400"],
  subsets: ["latin"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexus — Distributed File Processor",
  description: "Process massive datasets at scale. Calm, distributed, effortless.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${notoSansJP.variable} ${notoSerifJP.variable} ${firaCode.variable}`}
    >
      <body className="min-h-dvh flex flex-col antialiased">{children}</body>
    </html>
  );
}
