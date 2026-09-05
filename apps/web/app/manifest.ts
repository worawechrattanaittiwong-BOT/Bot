import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bot Trading SaaS",
    short_name: "Bot SaaS",
    description: "MT5 Cloud + Local trading bot control center",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#060809",
    theme_color: "#7c5cff",
    icons: []
  };
}
