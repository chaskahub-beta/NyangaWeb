"use strict";

/*
  Genera la demo estática en docs/ para GitHub Pages:
    npm run build:demo
  Copia public/, añade la API simulada (demo/mock-api.js + la lógica del servidor)
  y una franja "Démo". No hace falta servidor: las reservas viven en el navegador.
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs");

// Módulos del servidor que también funcionan en el navegador
const MODULES = { calendar: "server/calendar.js", catalog: "server/catalog.js", ics: "server/ics.js" };

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });

let bundle = `/* Generado por scripts/build-demo.js: no editar */\n` +
  `window.__NYANGA_MODULES = {};\n` +
  // ics.js usa Buffer.byteLength para cortar las líneas del .ics
  `var Buffer = { byteLength: function (s) { return new TextEncoder().encode(s).length; } };\n`;

for (const [name, file] of Object.entries(MODULES)) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/\brequire\(/.test(src)) throw new Error(`${file} usa require(): no se puede usar en la demo`);
  bundle += `\n/* ${file} */\n(function (module) {\n${src}\nwindow.__NYANGA_MODULES.${name} = module.exports;\n})({ exports: {} });\n`;
}
bundle += "\n" + fs.readFileSync(path.join(ROOT, "demo", "mock-api.js"), "utf8");
fs.writeFileSync(path.join(OUT, "js", "demo-api.js"), bundle);
fs.copyFileSync(path.join(ROOT, "demo", "demo.css"), path.join(OUT, "css", "demo.css"));

for (const page of ["index.html", "paiement-demo.html"]) {
  const file = path.join(OUT, page);
  let html = fs.readFileSync(file, "utf8");
  html = html
    .replace("</title>", "</title>\n  <meta name=\"robots\" content=\"noindex\">")
    .replace(/(\s*)<link rel="stylesheet" href="css\/styles.css">/, "$1<link rel=\"stylesheet\" href=\"css/styles.css\">$1<link rel=\"stylesheet\" href=\"css/demo.css\">")
    .replace(/(\s*)<script src="/, "$1<script src=\"js/demo-api.js\"></script>$1<script src=\"");
  if (!html.includes("js/demo-api.js") || !html.includes("css/demo.css")) throw new Error(`No se pudo preparar ${page}`);
  fs.writeFileSync(file, html);
}

// GitHub Pages: servir los archivos tal cual (sin Jekyll)
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

console.log("Demo lista en docs/ →", fs.readdirSync(OUT).join(", "));
