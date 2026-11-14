"use strict";

/*
  Sirve docs/ en http://localhost:5600/nyanga-web/ para revisar la demo
  tal como se verá en GitHub Pages (que la publica bajo /<nombre-del-repo>/).
*/

const path = require("path");
const express = require("express");

const app = express();
const PORT = Number(process.env.DEMO_PORT || 5600);
const BASE = "/nyanga-web";

app.use(BASE, express.static(path.join(__dirname, "..", "docs")));
app.get("/", (req, res) => res.redirect(BASE + "/"));
app.listen(PORT, () => console.log(`Démo → http://localhost:${PORT}${BASE}/`));
