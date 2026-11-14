"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Carga .env si existe (Node 22+ lo trae integrado)
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function loadConfig(overrides = {}) {
  const port = Number(env("PORT", 5500));
  const publicUrl = env("PUBLIC_URL", `http://localhost:${port}`).replace(/\/$/, "");

  const config = {
    root: ROOT,
    port,
    publicUrl,
    timezone: "Europe/Paris",
    // Dirección que aparece en el evento de agenda (pendiente de confirmar con la empresa)
    businessAddress: env("BUSINESS_ADDRESS", "Nyanga Beauty & Spa, Granges-Narboz, France"),
    dbPath: env("DB_PATH", path.join(ROOT, "data", "nyanga.db")),
    outboxDir: env("OUTBOX_DIR", path.join(ROOT, "data", "outbox")),

    // Reglas del negocio
    depositRate: 0.2,
    bookingWindowDays: Number(env("BOOKING_WINDOW_DAYS", 90)),
    holdMinutes: Number(env("HOLD_MINUTES", 30)),

    // Panel de la empresa
    adminPassword: env("ADMIN_PASSWORD", ""),
    sessionSecret: env("SESSION_SECRET", ""),

    // SumUp (sin clave = modo simulado)
    sumup: {
      apiKey: env("SUMUP_API_KEY", ""),
      merchantCode: env("SUMUP_MERCHANT_CODE", ""),
      apiBase: env("SUMUP_API_BASE", "https://api.sumup.com")
    },

    // Correo (sin SMTP = los correos se guardan en data/outbox)
    mail: {
      host: env("SMTP_HOST", ""),
      port: Number(env("SMTP_PORT", 587)),
      user: env("SMTP_USER", ""),
      pass: env("SMTP_PASS", ""),
      from: env("MAIL_FROM", "Nyanga Beauty & Spa <no-reply@localhost>"),
      companyEmail: env("COMPANY_EMAIL", "contact@example.com")
    },

    ...overrides
  };

  config.paymentsMode = config.sumup.apiKey && config.sumup.merchantCode ? "sumup" : "mock";
  config.mailMode = config.mail.host ? "smtp" : "outbox";
  config.secureCookies = config.publicUrl.startsWith("https://");

  if (!config.sessionSecret) {
    // En desarrollo se genera uno por arranque; en producción hay que definirlo
    config.sessionSecret = require("crypto").randomBytes(32).toString("hex");
    config.sessionSecretEphemeral = true;
  }

  return config;
}

module.exports = { loadConfig };
