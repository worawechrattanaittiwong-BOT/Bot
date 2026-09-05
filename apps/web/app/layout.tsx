import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bot Trading SaaS",
  description: "MT5 Cloud + Local Bot Control Platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
