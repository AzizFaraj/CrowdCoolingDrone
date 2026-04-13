import type { Metadata } from "next";
import { Inter } from "next/font/google";

import Sidebar from "@/components/layout/Sidebar";
import TopBanner from "@/components/layout/TopBanner";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "CrowdCooling GCS Dashboard",
  description:
    "Ground Control Station dashboard for the autonomous crowd-cooling misting drone.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="flex h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-200 antialiased">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBanner />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
