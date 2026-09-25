import type { MetadataRoute } from "next";
import { SCENOVA_BRAND_NAME, SCENOVA_MASTER_MARK } from "../lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SCENOVA_BRAND_NAME,
    short_name: SCENOVA_BRAND_NAME,
    description: "SCENOVA EA — MT5 trading automation and control center",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#060809",
    theme_color: "#080f20",
    icons: [
      {
        src: SCENOVA_MASTER_MARK,
        type: "image/png",
        purpose: "any"
      },
      {
        src: SCENOVA_MASTER_MARK,
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
