import type { Metadata } from "next";
import WebsitePage from "./website/page";

const SITE_URL = "https://snvea-bot.online";

export const metadata: Metadata = {
  title: "SCENOVA EA",
  description:
    "SCENOVA EA ระบบควบคุม MT5 BOT EA สำหรับการเทรดอัตโนมัติ รองรับ Cloud และ Local ใช้งานผ่านเว็บและมือถือ พร้อมระบบจัดการความเสี่ยง",
  alternates: {
    canonical: SITE_URL
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SCENOVA EA",
    title: "SCENOVA EA",
    description:
      "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local พร้อมระบบจัดการความเสี่ยง"
  },
  twitter: {
    card: "summary_large_image",
    title: "SCENOVA EA",
    description:
      "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local พร้อมระบบจัดการความเสี่ยง"
  }
};

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SCENOVA EA",
  alternateName: "SCENOVA",
  url: SITE_URL,
  description:
    "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local"
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <WebsitePage />
    </>
  );
}
