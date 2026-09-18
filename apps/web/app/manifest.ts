import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SCENOVA — Intelligent EA Ecosystem",
    short_name: "SCENOVA",
    description: "SCENOVA AI-powered EA and MT5 trading control center",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#050506",
    theme_color: "#ff2438",
    icons: []
  };
}
