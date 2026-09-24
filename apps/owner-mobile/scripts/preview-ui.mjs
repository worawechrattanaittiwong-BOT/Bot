import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await build({
  absWorkingDir: root, entryPoints: ["preview/index.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { __DEV__: "true", "process.env.NODE_ENV": '"development"' },
  alias: { "react-native": "react-native-web" },
  resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
  plugins: [{ name: "preview-icon", setup(b) { b.onLoad({ filter: /scenova-owner-icon-v2\.png$/ }, () => ({ contents: 'module.exports = { uri: "/icon.png" };', loader: "js" })); } }],
});
const bundle = result.outputFiles[0].contents;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SCENOVA Owner · UI preview / ข้อมูลตัวอย่าง</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#080f1e}*{box-sizing:border-box}input,textarea,button{font-family:inherit}#root>div{height:100%}</style></head><body><div id="root"></div><script src="/preview.js"></script></body></html>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/preview.js") { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(bundle); }
  else if (url.pathname === "/icon.png") { res.setHeader("Content-Type", "image/png"); res.end(await readFile(path.join(root, "assets/scenova-owner-icon-v2.png"))); }
  else if (url.pathname === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
server.listen(4175, "127.0.0.1", () => console.log("Owner UI preview: http://127.0.0.1:4175 — sample data only; no financial API requests."));
