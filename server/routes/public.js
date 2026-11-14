"use strict";

const express = require("express");
const { categories, services } = require("../catalog");

/** Límite sencillo de peticiones por IP (en memoria). */
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const h = hits.get(key);
    if (!h || h.until < now) { hits.set(key, { n: 1, until: now + windowMs }); return next(); }
    if (++h.n > max) return res.status(429).json({ error: "too_many_requests" });
    next();
  };
}

function publicRoutes({ config, bookings, payments }) {
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  r.get("/catalog", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      depositRate: config.depositRate,
      categories,
      services: services.map((s) => ({
        id: s.id, cat: s.cat, price: s.price, duration: s.duration,
        slotMinutes: s.slotMinutes, name: s.name, sub: s.sub, desc: s.desc
      }))
    });
  });

  // Días del mes con su estado para una duración total
  r.get("/availability", (req, res) => {
    const minutes = Number(req.query.minutes);
    res.json(bookings.month(String(req.query.month || ""), minutes));
  });

  // Horarios libres de un día
  r.get("/availability/day", (req, res) => {
    const minutes = Number(req.query.minutes);
    res.json(bookings.day(String(req.query.date || ""), minutes));
  });

  r.post("/bookings", rateLimit(20, 60 * 60 * 1000), wrap(async (req, res) => {
    const result = await bookings.create(req.body);
    res.status(201).json(result);
  }));

  r.get("/bookings/:id", wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await bookings.publicStatus(req.params.id, String(req.query.t || "")));
  }));

  // "Ajouter à mon agenda": iPhone/Outlook abren el .ics; Android lo pasa a la app de calendario.
  r.get("/bookings/:id/calendar.ics", wrap(async (req, res) => {
    const ics = bookings.calendarFile(req.params.id, String(req.query.t || ""));
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="nyanga-rendez-vous.ics"');
    res.send(ics);
  }));

  r.post("/bookings/:id/pay", rateLimit(20, 60 * 60 * 1000), wrap(async (req, res) => {
    res.json(await bookings.retryPayment(req.params.id, String((req.body && req.body.t) || "")));
  }));

  // Aviso de SumUp (return_url). Siempre se vuelve a consultar el cobro.
  r.post("/payments/sumup/webhook", wrap(async (req, res) => {
    await bookings.handleWebhook(req.body);
    res.status(200).json({ ok: true });
  }));

  // Solo en modo simulado: la página de pago de prueba marca el resultado
  if (payments.mode === "mock") {
    r.post("/dev/mock-pay", wrap(async (req, res) => {
      const { id, t, result } = req.body || {};
      const b = bookings.findWithToken(id, String(t || ""));
      if (!b.checkout_id) return res.status(409).json({ error: "no_checkout" });
      payments.mockSetStatus(b.checkout_id, result === "fail" ? "FAILED" : "PAID");
      await bookings.handleWebhook({ id: b.checkout_id });
      res.json({ ok: true });
    }));

    r.get("/dev/mock-pay/:id", wrap(async (req, res) => {
      const s = await bookings.publicStatus(req.params.id, String(req.query.t || ""));
      res.json({ depositCents: s.depositCents, status: s.status, date: s.date, start: s.start });
    }));
  }

  return r;
}

module.exports = { publicRoutes };
