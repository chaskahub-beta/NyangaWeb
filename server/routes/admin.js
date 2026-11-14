"use strict";

const express = require("express");
const cal = require("../calendar");
const { getSettings, saveSettings } = require("../db");
const { AppError } = require("../bookings");

function validateSettings(input, current) {
  const out = { ...current };
  if (input.openingHours) {
    const hours = {};
    for (let d = 0; d <= 6; d++) {
      const list = input.openingHours[d] || input.openingHours[String(d)] || [];
      if (!Array.isArray(list) || list.length > 3) throw new AppError("invalid_hours");
      hours[d] = list.map((pair) => {
        if (!Array.isArray(pair) || !cal.isTime(pair[0]) || !cal.isTime(pair[1]) || cal.toMin(pair[0]) >= cal.toMin(pair[1])) {
          throw new AppError("invalid_hours");
        }
        return [pair[0], pair[1]];
      }).sort((a, b) => cal.toMin(a[0]) - cal.toMin(b[0]));
      for (let i = 1; i < hours[d].length; i++) {
        if (cal.toMin(hours[d][i][0]) < cal.toMin(hours[d][i - 1][1])) throw new AppError("invalid_hours");
      }
    }
    out.openingHours = hours;
  }
  if (input.slotStep !== undefined) {
    const v = Number(input.slotStep);
    if (![15, 30, 45, 60].includes(v)) throw new AppError("invalid_step");
    out.slotStep = v;
  }
  if (input.bufferMinutes !== undefined) {
    const v = Number(input.bufferMinutes);
    if (!Number.isInteger(v) || v < 0 || v > 120) throw new AppError("invalid_buffer");
    out.bufferMinutes = v;
  }
  return out;
}

function adminRoutes({ config, db, bookings, auth }) {
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  r.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  r.post("/login", (req, res) => {
    const result = auth.login(req, req.body && req.body.password);
    if (!result.ok) {
      const status = result.error === "too_many_attempts" ? 429 : result.error === "admin_disabled" ? 503 : 401;
      return res.status(status).json({ error: result.error });
    }
    auth.issue(res);
    res.json({ ok: true });
  });

  r.post("/logout", (req, res) => { auth.clear(res); res.json({ ok: true }); });

  r.get("/session", (req, res) => {
    res.json({ authenticated: auth.isValid(req), paymentsMode: config.paymentsMode, mailMode: config.mailMode });
  });

  r.use(auth.guard);

  r.get("/bookings", (req, res) => {
    res.json(bookings.list({ from: req.query.from, to: req.query.to, status: req.query.status }));
  });

  r.get("/bookings/:id", (req, res) => res.json(bookings.get(req.params.id)));

  r.post("/bookings/:id/action", wrap(async (req, res) => {
    const { action, notify, note } = req.body || {};
    res.json(await bookings.adminAction(req.params.id, action, { notify: notify === true, note }));
  }));

  r.get("/calendar", (req, res) => res.json(bookings.adminMonth(String(req.query.month || ""))));

  r.get("/blocks", (req, res) => res.json(bookings.blocks(req.query.from, req.query.to)));
  r.post("/blocks", (req, res) => res.status(201).json(bookings.addBlock(req.body || {})));
  r.delete("/blocks/:id", (req, res) => { bookings.removeBlock(req.params.id); res.json({ ok: true }); });

  r.get("/gift/:code", (req, res) => res.json(bookings.giftLookup(req.params.code)));
  r.post("/gift/:code/redeem", (req, res) => {
    res.json(bookings.giftRedeem(req.params.code, !!(req.body && req.body.force)));
  });

  r.get("/settings", (req, res) => res.json(getSettings(db)));
  r.put("/settings", (req, res) => {
    const next = validateSettings(req.body || {}, getSettings(db));
    saveSettings(db, next);
    res.json(next);
  });

  return r;
}

module.exports = { adminRoutes };
