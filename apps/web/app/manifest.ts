import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SCENOVA EA",
    short_name: "SCENOVA EA",
    description: "SCENOVA EA — MT5 trading automation and control center",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#060809",
    theme_color: "#080f20",
    icons: [
      {
        src: "/scenova-ea-icon.png",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/scenova-ea-icon.png",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
