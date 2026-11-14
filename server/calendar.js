"use strict";

/*
  Agenda: festivos franceses, hora de París y cálculo de horarios libres.
  Las fechas son cadenas "AAAA-MM-DD" y las horas "HH:MM" en hora de París.
*/

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n) => String(n).padStart(2, "0");

function isDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isTime(s) { return typeof s === "string" && TIME_RE.test(s); }

function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function toTime(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }

function dateKey(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekday(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Fecha y minutos actuales en París. */
function parisNow(now = new Date(), timeZone = "Europe/Paris") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateKey(y, month, day);
}

const holidayCache = new Map();

/** Jours fériés en France métropolitaine. */
function frenchHolidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const e = easter(y);
  const map = new Map([
    [dateKey(y, 1, 1), "Jour de l'an"],
    [addDays(e, 1), "Lundi de Pâques"],
    [dateKey(y, 5, 1), "Fête du Travail"],
    [dateKey(y, 5, 8), "Victoire 1945"],
    [addDays(e, 39), "Ascension"],
    [addDays(e, 50), "Lundi de Pentecôte"],
    [dateKey(y, 7, 14), "Fête nationale"],
    [dateKey(y, 8, 15), "Assomption"],
    [dateKey(y, 11, 1), "Toussaint"],
    [dateKey(y, 11, 11), "Armistice"],
    [dateKey(y, 12, 25), "Noël"]
  ]);
  holidayCache.set(y, map);
  return map;
}

function holidayName(key) {
  return frenchHolidays(Number(key.slice(0, 4))).get(key) || null;
}

/**
  Estado de un día y sus horarios libres para una duración dada.

  ctx = {
    settings,             // horarios, paso y pausa
    blocks,               // bloqueos de ese día [{start,end}] (null = día entero)
    busy,                 // reservas activas de ese día [{start,end}]
    today,                // "AAAA-MM-DD" en París
    windowDays            // días reservables desde hoy
  }
*/
function dayAvailability(key, minutes, ctx) {
  const { settings, blocks = [], busy = [], today, windowDays } = ctx;
  const result = { date: key, status: "open", slots: [] };

  const first = addDays(today, 1);
  const last = addDays(today, windowDays);
  if (key < first || key > last) { result.status = "out"; return result; }

  const holiday = holidayName(key);
  if (holiday) { result.status = "holiday"; result.holiday = holiday; return result; }

  const hours = settings.openingHours[weekday(key)] || [];
  if (hours.length === 0) { result.status = "closed"; return result; }

  if (blocks.some((b) => !b.start || !b.end)) { result.status = "blocked"; return result; }

  const step = settings.slotStep;
  const buffer = settings.bufferMinutes;
  const busyMin = busy.map((b) => [toMin(b.start), toMin(b.end)]);
  const blockMin = blocks.map((b) => [toMin(b.start), toMin(b.end)]);

  for (const [open, close] of hours) {
    const o = toMin(open), c = toMin(close);
    for (let s = o; s + minutes <= c; s += step) {
      const e = s + minutes;
      // Entre dos reservas debe quedar al menos la pausa
      const clashBooking = busyMin.some(([bs, be]) => s < be + buffer && e + buffer > bs);
      const clashBlock = blockMin.some(([bs, be]) => s < be && e > bs);
      if (!clashBooking && !clashBlock) result.slots.push(toTime(s));
    }
  }

  if (result.slots.length === 0) result.status = "full";
  return result;
}

module.exports = {
  isDate, isTime, toMin, toTime, addDays, weekday, parisNow,
  easter, frenchHolidays, holidayName, dayAvailability
};
