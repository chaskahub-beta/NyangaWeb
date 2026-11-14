/*
  Muestra docs/ en http://localhost:5600/NyangaWeb/ tal como lo publica GitHub Pages.
    node demo/serve-demo.mjs
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const BASE = "/NyangaWeb";
const PORT = Number(process.env.DEMO_PORT || 5600);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith(BASE)) { res.writeHead(302, { Location: BASE + "/" }); return res.end(); }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "/";
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(DOCS, path.normalize(rel));
  if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Démo → http://localhost:${PORT}${BASE}/`));
