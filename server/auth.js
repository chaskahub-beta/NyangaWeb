"use strict";

/*
  Sesión del panel de la empresa: contraseña única (ADMIN_PASSWORD) y una
  cookie firmada con HMAC que caduca a las 12 horas.
*/

const crypto = require("crypto");

const COOKIE = "nyanga_admin";
const TTL_MS = 12 * 60 * 60 * 1000;

function sign(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // mismo tiempo aunque no coincidan
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function createAuth(config, clock = { now: () => new Date() }) {
  const attempts = new Map(); // ip → { count, until }

  function issue(res) {
    const exp = clock.now().getTime() + TTL_MS;
    const payload = `admin.${exp}`;
    const value = `${payload}.${sign(config.sessionSecret, payload)}`;
    res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_MS / 1000}${config.secureCookies ? "; Secure" : ""}`);
  }

  function clear(res) {
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.secureCookies ? "; Secure" : ""}`);
  }

  function isValid(req) {
    const v = parseCookies(req.headers.cookie)[COOKIE];
    if (!v) return false;
    const parts = v.split(".");
    if (parts.length !== 3) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    if (!safeEqual(parts[2], sign(config.sessionSecret, payload))) return false;
    return Number(parts[1]) > clock.now().getTime();
  }

  function guard(req, res, next) {
    if (isValid(req)) return next();
    res.status(401).json({ error: "unauthorized" });
  }

  /** Comprueba la contraseña con límite de intentos por IP. */
  function login(req, password) {
    if (!config.adminPassword) return { ok: false, error: "admin_disabled" };
    const ip = req.ip || "unknown";
    const now = clock.now().getTime();
    const a = attempts.get(ip);
    if (a && a.until > now && a.count >= 5) return { ok: false, error: "too_many_attempts" };
    if (safeEqual(password || "", config.adminPassword)) {
      attempts.delete(ip);
      return { ok: true };
    }
    const next = a && a.until > now ? { count: a.count + 1, until: a.until } : { count: 1, until: now + 15 * 60 * 1000 };
    attempts.set(ip, next);
    return { ok: false, error: "wrong_password" };
  }

  return { issue, clear, isValid, guard, login };
}

module.exports = { createAuth };
