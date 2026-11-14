"use strict";

const path = require("path");
const express = require("express");
const { loadConfig } = require("./config");
const { openDb } = require("./db");
const { createPayments } = require("./sumup");
const { createMailer } = require("./mailer");
const { createBookingService, AppError } = require("./bookings");
const { createAuth } = require("./auth");
const { publicRoutes } = require("./routes/public");
const { adminRoutes } = require("./routes/admin");

function createApp(options = {}) {
  const config = options.config || loadConfig();
  const clock = options.clock || { now: () => new Date() };
  const db = options.db || openDb(config.dbPath);
  const payments = options.payments || createPayments(config);
  const mailer = options.mailer || createMailer(config);
  const bookings = createBookingService({ db, config, payments, mailer, clock });
  const auth = createAuth(config, clock);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'"
      ].join("; ")
    });
    next();
  });

  app.use(express.json({ limit: "20kb" }));

  // Comprobación de salud para Docker y el alojamiento
  app.get("/health", (req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use("/api/admin", adminRoutes({ config, db, bookings, auth }));
  app.use("/api", publicRoutes({ config, bookings, payments }));
  app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

  app.use("/admin", express.static(path.join(config.root, "admin"), { index: "index.html" }));
  app.use(express.static(path.join(config.root, "public"), { index: "index.html" }));

  // Errores → JSON con un código que el sitio sabe traducir
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, ...(err.extra || {}) });
    }
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json" });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "too_large" });
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });

  // Libera cada minuto las reservas no pagadas cuya retención caducó
  const timer = setInterval(() => { try { bookings.expireHolds(); } catch (e) { console.error(e); } }, 60000);
  timer.unref();

  return { app, config, db, bookings, payments, mailer, close: () => { clearInterval(timer); db.close(); } };
}

if (require.main === module) {
  const ctx = createApp();
  const { app, config } = ctx;
  const server = app.listen(config.port, () => {
    console.log(`Nyanga Beauty & Spa → ${config.publicUrl}`);
    console.log(`Panel → ${config.publicUrl}/admin`);
    console.log(`Paiements : ${config.paymentsMode === "sumup" ? "SumUp" : "mode simulé (pas de clé SumUp)"}`);
    console.log(`E-mails  : ${config.mailMode === "smtp" ? "SMTP" : "enregistrés dans data/outbox"}`);
    if (!config.adminPassword) console.log("⚠ ADMIN_PASSWORD vide : le panel est désactivé.");
    if (config.sessionSecretEphemeral) console.log("⚠ SESSION_SECRET vide : les sessions du panel expirent à chaque redémarrage.");
  });

  // Arrêt propre (docker stop envoie SIGTERM) : on termine les requêtes et on ferme la base
  const shutdown = (signal) => {
    console.log(`${signal} reçu, arrêt…`);
    server.close(() => { ctx.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = { createApp };
