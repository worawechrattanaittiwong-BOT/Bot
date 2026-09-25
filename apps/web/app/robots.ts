import type { MetadataRoute } from "next";

const SITE_URL = "https://snvea-bot.online";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/website", "/_next/", "/assets/"],
        disallow: [
          "/account/",
          "/admin/",
          "/api/",
          "/cloud/",
          "/dashboard/",
          "/installer-download/",
          "/login",
          "/onboarding/",
          "/packages/",
          "/partner/",
          "/performance/",
          "/referrals/",
          "/reset-password/",
          "/runtime-migration/",
          "/shared-performance/",
          "/trading-symbol/",
          "/verify-2fa/",
          "/verify-email/"
        ]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
