/*
  Genera la demo estática en docs/ para GitHub Pages (sin servidor ni base de datos):
    node demo/build-demo.mjs
  Copia public_html/ (sin la API ni el panel), añade la API simulada en el navegador
  y una franja "Démo". Las reservas de la demo viven solo en el navegador.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DEMO, "..");
const SRC = path.join(ROOT, "public_html");
const OUT = path.join(ROOT, "docs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(SRC, src).split(path.sep).join("/");
    // Fuera de la demo: API PHP, panel, .htaccess y las imágenes de los correos
    return !["api", "admin", ".htaccess", "img/mail"].some((x) => rel === x || rel.startsWith(x + "/"));
  }
});

const catalog = fs.readFileSync(path.join(ROOT, "nyanga-app", "catalog.json"), "utf8");
let bundle = "/* Generado por demo/build-demo.mjs: no editar */\n" +
  "window.__NYANGA_MODULES = {};\n" +
  "var CATALOG_DATA = " + catalog.trim() + ";\n" +
  // ics.js usa Buffer.byteLength para cortar las líneas del .ics
  "var Buffer = { byteLength: function (s) { return new TextEncoder().encode(s).length; } };\n";

for (const name of ["calendar", "catalog", "ics"]) {
  const src = fs.readFileSync(path.join(DEMO, "lib", name + ".js"), "utf8");
  if (/\brequire\(/.test(src)) throw new Error(`lib/${name}.js usa require(): no se puede usar en la demo`);
  bundle += `\n/* lib/${name}.js */\n(function (module) {\n${src}\nwindow.__NYANGA_MODULES.${name} = module.exports;\n})({ exports: {} });\n`;
}
bundle += "\n" + fs.readFileSync(path.join(DEMO, "mock-api.js"), "utf8");
fs.writeFileSync(path.join(OUT, "js", "demo-api.js"), bundle);
fs.copyFileSync(path.join(DEMO, "demo.css"), path.join(OUT, "css", "demo.css"));

for (const page of ["index.html", "paiement-demo.html"]) {
  const file = path.join(OUT, page);
  let html = fs.readFileSync(file, "utf8");
  html = html
    .replace("</title>", "</title>\n  <meta name=\"robots\" content=\"noindex\">")
    .replace(/(\s*)(<link rel="stylesheet" href="css\/styles\.css[^"]*">)/, "$1$2$1<link rel=\"stylesheet\" href=\"css/demo.css\">")
    .replace(/(\s*)<script src="/, "$1<script src=\"js/demo-api.js\"></script>$1<script src=\"");
  if (!html.includes("js/demo-api.js") || !html.includes("css/demo.css")) throw new Error(`No se pudo preparar ${page}`);
  fs.writeFileSync(file, html);
}

// GitHub Pages: servir los archivos tal cual (sin Jekyll)
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log("Demo lista en docs/ →", fs.readdirSync(OUT).join(", "));
