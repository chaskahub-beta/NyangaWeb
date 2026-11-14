/* Generado por demo/build-demo.mjs: no editar */
window.__NYANGA_MODULES = {};
var CATALOG_DATA = {
  "categories": [
    {
      "id": "massages",
      "name": {
        "fr": "Massages",
        "en": "Massages"
      }
    },
    {
      "id": "headspa",
      "name": {
        "fr": "Head Spa",
        "en": "Head Spa"
      }
    },
    {
      "id": "soins",
      "name": {
        "fr": "Autres soins",
        "en": "Other treatments"
      }
    }
  ],
  "services": [
    {
      "id": "signature",
      "cat": "massages",
      "price": 60,
      "duration": 70,
      "slotMinutes": 70,
      "name": {
        "fr": "Massage signature Nyanga",
        "en": "Nyanga signature massage"
      },
      "sub": {
        "fr": "Pressothérapie + modelage",
        "en": "Pressotherapy + massage"
      },
      "desc": {
        "fr": "15 minutes de pressothérapie sur siège pour stimuler la circulation et préparer le corps, puis notre massage signature.",
        "en": "15 minutes of seated pressotherapy to boost circulation and prepare the body, followed by our signature massage."
      }
    },
    {
      "id": "relaxant",
      "cat": "massages",
      "price": 50,
      "duration": 60,
      "slotMinutes": 60,
      "name": {
        "fr": "Massage relaxant",
        "en": "Relaxing massage"
      },
      "desc": {
        "fr": "Un voyage sensoriel pour libérer les tensions accumulées.",
        "en": "A sensory journey to release built-up tension."
      }
    },
    {
      "id": "sportif",
      "cat": "massages",
      "price": 70,
      "duration": 60,
      "slotMinutes": 60,
      "name": {
        "fr": "Massage sportif",
        "en": "Sports massage"
      },
      "desc": {
        "fr": "Conçu pour les corps actifs : pétrissage profond et friction ciblée pour favoriser la récupération musculaire, améliorer la souplesse et prévenir les blessures.",
        "en": "Designed for active bodies: deep kneading and targeted friction to support muscle recovery, improve flexibility and prevent injury."
      }
    },
    {
      "id": "headspa-decouverte",
      "cat": "headspa",
      "price": 55,
      "duration": 45,
      "slotMinutes": 45,
      "name": {
        "fr": "Head spa découverte",
        "en": "Head spa discovery"
      },
      "sub": {
        "fr": "Méthode Shiatsu",
        "en": "Shiatsu method"
      },
      "desc": {
        "fr": "Initiation au rituel : soin du cuir chevelu pour nourrir et revitaliser les racines, sur table head spa massante et chauffante.",
        "en": "An introduction to the ritual: scalp care to nourish and revitalise the roots, on a heated massage head spa table."
      }
    },
    {
      "id": "headspa-detente",
      "cat": "headspa",
      "price": 80,
      "duration": 60,
      "slotMinutes": 60,
      "name": {
        "fr": "Head spa détente",
        "en": "Head spa relax"
      },
      "sub": {
        "fr": "Méthode Shiatsu",
        "en": "Shiatsu method"
      },
      "desc": {
        "fr": "Head spa découverte + modelage des épaules.",
        "en": "Head spa discovery + shoulder massage."
      }
    },
    {
      "id": "headspa-voyage",
      "cat": "headspa",
      "price": 95,
      "duration": 90,
      "slotMinutes": 90,
      "name": {
        "fr": "Head spa voyage",
        "en": "Head spa journey"
      },
      "sub": {
        "fr": "Méthode Shiatsu",
        "en": "Shiatsu method"
      },
      "desc": {
        "fr": "Head spa détente complet + rituel visage.",
        "en": "The full head spa relax + facial ritual."
      }
    },
    {
      "id": "hammam",
      "cat": "soins",
      "price": 70,
      "duration": 60,
      "slotMinutes": 60,
      "name": {
        "fr": "Hammam - Gommage",
        "en": "Hammam - Body scrub"
      },
      "desc": {
        "fr": "Vapeur chaude pour ouvrir les pores et détendre les muscles en profondeur, puis exfoliation corporelle.",
        "en": "Warm steam to open the pores and deeply relax the muscles, followed by a full body exfoliation."
      }
    },
    {
      "id": "pieds",
      "cat": "soins",
      "price": 50,
      "duration": null,
      "slotMinutes": 60,
      "name": {
        "fr": "Rituel pieds",
        "en": "Foot ritual"
      },
      "desc": {
        "fr": "Massage des pieds à l'huile chaude, vernis semi-permanent inclus.",
        "en": "Warm oil foot massage, semi-permanent polish included."
      }
    },
    {
      "id": "mains",
      "cat": "soins",
      "price": 50,
      "duration": null,
      "slotMinutes": 60,
      "name": {
        "fr": "Rituel mains",
        "en": "Hand ritual"
      },
      "desc": {
        "fr": "Soin à la paraffine, vernis semi-permanent inclus.",
        "en": "Paraffin treatment, semi-permanent polish included."
      }
    },
    {
      "id": "visage",
      "cat": "soins",
      "price": 40,
      "duration": null,
      "slotMinutes": 45,
      "name": {
        "fr": "Rituel visage",
        "en": "Facial ritual"
      },
      "desc": {
        "fr": "Avec vapozone et luminothérapie.",
        "en": "With vapozone steam and light therapy."
      }
    },
    {
      "id": "tresses",
      "cat": "soins",
      "price": 30,
      "duration": null,
      "slotMinutes": 60,
      "name": {
        "fr": "Tresses africaines",
        "en": "African braids"
      },
      "desc": {
        "fr": "Tous types de tresses.",
        "en": "All types of braids."
      }
    }
  ]
};
var Buffer = { byteLength: function (s) { return new TextEncoder().encode(s).length; } };

/* lib/calendar.js */
(function (module) {
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

window.__NYANGA_MODULES.calendar = module.exports;
})({ exports: {} });

/* lib/catalog.js */
(function (module) {
"use strict";

/*
  Catálogo para la demo: mismos datos que nyanga-app/catalog.json
  (build-demo.mjs los inyecta en CATALOG_DATA) y misma validación que Catalog.php.
*/

const { categories, services } = CATALOG_DATA;
const byId = new Map(services.map((s) => [s.id, s]));

function getService(id) {
  return byId.get(id) || null;
}

function priceSelection(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("services_required");
  if (ids.length > 6) throw new Error("too_many_services");
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new Error("duplicate_services");
  const items = unique.map((id) => {
    const s = getService(id);
    if (!s) throw new Error("unknown_service");
    return s;
  });
  const totalCents = items.reduce((sum, s) => sum + Math.round(s.price * 100), 0);
  const minutes = items.reduce((sum, s) => sum + s.slotMinutes, 0);
  return { items, totalCents, minutes };
}

module.exports = { categories, services, getService, priceSelection };

window.__NYANGA_MODULES.catalog = module.exports;
})({ exports: {} });

/* lib/ics.js */
(function (module) {
"use strict";

/*
  "Ajouter à mon agenda": archivo .ics (iPhone, Outlook, Android) y enlace de Google Agenda.
  Las horas se guardan en hora de París y aquí se convierten a UTC, que todos los calendarios entienden.
  El .ics lleva dos recordatorios (la víspera y 2 h antes). Google ignora los recordatorios
  de un enlace y usa los del propio usuario.
*/

const ZONE = "Europe/Paris";

/** Offset (ms) de París respecto a UTC en un instante dado. */
function parisOffset(ms) {
  const parts = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(ms)).forEach((p) => { parts[p.type] = p.value; });
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - ms;
}

/** "2026-11-16" + "09:30" (hora de París) → Date en UTC. */
function parisToDate(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const local = Date.UTC(y, m - 1, d, h, mi);
  let utc = local - parisOffset(local);
  utc = local - parisOffset(utc); // segunda pasada por si cae junto a un cambio de hora
  return new Date(utc);
}

/** Date → 20261116T083000Z */
function stamp(dt) {
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Texto seguro dentro de un .ics */
function icsText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Líneas de máx. 75 octetos (RFC 5545), sin cortar caracteres UTF-8. */
function fold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    const limit = out.length ? 74 : 75; // las líneas de continuación empiezan con un espacio
    if (bytes + n > limit) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const TXT = {
  fr: {
    title: "Nyanga Beauty & Spa",
    rest: "Reste à régler sur place",
    code: "Code carte cadeau",
    offered: (n) => `Offert par ${n}`,
    reminder: "Rappel : rendez-vous chez Nyanga Beauty & Spa",
    contact: "Pour modifier ou annuler, contactez directement Nyanga Beauty."
  },
  en: {
    title: "Nyanga Beauty & Spa",
    rest: "Left to pay on site",
    code: "Gift card code",
    offered: (n) => `Gift from ${n}`,
    reminder: "Reminder: appointment at Nyanga Beauty & Spa",
    contact: "To change or cancel, please contact Nyanga Beauty directly."
  }
};

function eur(cents, lang) {
  return new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", {
    style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

/**
 * Datos del evento.
 * audience: "client" (quien asiste) o "company" (agenda de la empresa, con el nombre de la clienta).
 */
function eventData(b, { lang, address, audience = "client" }) {
  const L = TXT[lang === "en" ? "en" : "fr"];
  const services = JSON.parse(b.services_json);
  const names = services.map((s) => (s.name && (s.name[lang] || s.name.fr)) || s.id);
  const guest = b.mode === "gift" ? b.gift_name : b.client_name;

  const title = audience === "company"
    ? `${guest} · ${names.join(", ")}`
    : `${L.title} · ${names.join(", ")}`;

  const lines = [names.join(", ")];
  lines.push(`${L.rest} : ${eur(b.total_cents - b.deposit_cents, lang)}`);
  if (b.mode === "gift" && b.gift_code) {
    lines.push(`${L.code} : ${b.gift_code}`);
    lines.push(L.offered(b.client_name));
  }
  if (audience === "company") {
    lines.push(`${b.client_name} · ${b.client_email} · ${b.client_phone}`);
    lines.push(`Réf. ${b.id}`);
  } else {
    lines.push(L.contact);
  }

  return {
    uid: `${b.id}@nyanga-beauty`,
    start: parisToDate(b.date, b.start),
    end: parisToDate(b.date, b.end),
    title,
    description: lines.join("\n"),
    location: address,
    reminder: L.reminder
  };
}

/**
 * Archivo .ics de la reserva. cancel=true genera la anulación del mismo evento
 * (mismo UID), para que el calendario lo quite.
 */
function buildIcs(b, { lang, address, audience, now = new Date(), cancel = false }) {
  const e = eventData(b, { lang, address, audience });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nyanga Beauty & Spa//Reservations//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancel ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `SEQUENCE:${cancel ? 1 : 0}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    `LOCATION:${icsText(e.location)}`,
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE"
  ];
  if (!cancel) {
    for (const trigger of ["-P1D", "-PT2H"]) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.reminder)}`, `TRIGGER:${trigger}`, "END:VALARM");
    }
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Enlace "Ajouter à Google Agenda". */
function googleUrl(b, { lang, address }) {
  const e = eventData(b, { lang, address });
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    details: e.description,
    location: e.location,
    ctz: ZONE
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Enlaces para la clienta (el .ics necesita el token de la reserva). */
function calendarLinks(b, { publicUrl, address, lang }) {
  return {
    ics: `${publicUrl}/api/bookings/${encodeURIComponent(b.id)}/calendar.ics?t=${encodeURIComponent(b.token)}`,
    google: googleUrl(b, { lang, address })
  };
}

module.exports = { buildIcs, googleUrl, calendarLinks, parisToDate, stamp };

window.__NYANGA_MODULES.ics = module.exports;
})({ exports: {} });

/*
  API simulada para la demo estática (GitHub Pages).
  Reproduce /api/* en el navegador con la misma lógica del servidor
  (catálogo, festivos, horarios, carte cadeau, agenda .ics).
  Las reservas se guardan solo en este navegador (localStorage).
  Se incluye en docs/js/demo-api.js mediante demo/build-demo.mjs.
*/
(function () {
  "use strict";

  var M = window.__NYANGA_MODULES;
  var cal = M.calendar;
  var catalog = M.catalog;
  var ics = M.ics;

  var CONFIG = {
    depositRate: 0.2,
    windowDays: 90,
    holdMinutes: 30,
    address: "Nyanga Beauty & Spa, Granges-Narboz, France",
    settings: {
      openingHours: { 0: [], 1: [["09:30", "18:30"]], 2: [["09:30", "18:30"]], 3: [["09:30", "18:30"]], 4: [["09:30", "18:30"]], 5: [["09:30", "18:30"]], 6: [] },
      slotStep: 30,
      bufferMinutes: 15
    }
  };

  var KEY = "nyanga-demo-bookings";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  var memory = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* navegación privada */ }
  }

  function randomId(n) {
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    var out = "";
    var bytes = crypto.getRandomValues(new Uint8Array(n));
    for (var i = 0; i < n; i++) out += a[bytes[i] % a.length];
    return out;
  }
  function giftCode() {
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var bytes = crypto.getRandomValues(new Uint8Array(8));
    var s = "";
    for (var i = 0; i < 8; i++) s += a[bytes[i] % a.length];
    return "NYG-" + s.slice(0, 4) + "-" + s.slice(4);
  }

  function today() { return cal.parisNow(new Date(), "Europe/Paris").date; }
  function nowIso() { return new Date().toISOString(); }

  function expireHolds() {
    var n = nowIso();
    Object.keys(memory).forEach(function (id) {
      var b = memory[id];
      if (b.status === "pending_payment" && b.hold_expires_at <= n) b.status = "expired";
    });
  }

  function busyOn(date, excludeId) {
    var n = nowIso();
    return Object.keys(memory).map(function (k) { return memory[k]; }).filter(function (b) {
      if (b.date !== date || b.id === excludeId) return false;
      return b.status === "confirmed" || b.status === "completed" ||
        (b.status === "pending_payment" && b.hold_expires_at > n);
    });
  }

  function day(date, minutes, excludeId) {
    return cal.dayAvailability(date, minutes, {
      settings: CONFIG.settings, blocks: [], busy: busyOn(date, excludeId),
      today: today(), windowDays: CONFIG.windowDays
    });
  }

  function err(status, code, extra) {
    var e = new Error(code); e.status = status; e.body = Object.assign({ error: code }, extra || {}); return e;
  }

  function clean(s, max) { return String(s == null ? "" : s).trim().replace(/\s+/g, " ").slice(0, max); }

  function validate(input) {
    var mode = input.mode;
    if (mode !== "me" && mode !== "gift") throw err(400, "invalid_mode");
    var sel;
    try { sel = catalog.priceSelection(input.services); } catch (e) { throw err(400, e.message); }
    if (!cal.isDate(input.date)) throw err(400, "invalid_date");
    if (!cal.isTime(input.start)) throw err(400, "invalid_time");
    var c = input.client || {};
    var client = { name: clean(c.name, 100), email: clean(c.email, 254).toLowerCase(), phone: clean(c.phone, 30) };
    var fields = [];
    if (client.name.length < 2) fields.push("client.name");
    if (!EMAIL_RE.test(client.email)) fields.push("client.email");
    var digits = client.phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) fields.push("client.phone");
    var gift = null;
    if (mode === "gift") {
      var g = input.gift || {};
      gift = { name: clean(g.name, 100), age: Number(g.age), email: clean(g.email, 254).toLowerCase(), message: clean(g.message, 300) };
      if (gift.name.length < 2) fields.push("gift.name");
      if (!Number.isInteger(gift.age) || gift.age < 1 || gift.age > 120) fields.push("gift.age");
      if (!EMAIL_RE.test(gift.email)) fields.push("gift.email");
    }
    if (input.acceptDeposit !== true) fields.push("acceptDeposit");
    if (fields.length) throw err(400, "invalid_fields", { fields: fields });
    return { lang: input.lang === "en" ? "en" : "fr", mode: mode, sel: sel, date: input.date, start: input.start, client: client, gift: gift, payFull: input.payFull === true };
  }

  function paymentUrl(b) {
    return "paiement-demo.html?reservation=" + encodeURIComponent(b.id) + "&t=" + encodeURIComponent(b.token);
  }

  function find(id, token) {
    var b = memory[id];
    if (!b || b.token !== token) throw err(404, "not_found");
    return b;
  }

  function calendarLinks(b) {
    var file = ics.buildIcs(b, { lang: b.lang, address: CONFIG.address });
    return {
      ics: "data:text/calendar;charset=utf-8," + encodeURIComponent(file),
      google: ics.googleUrl(b, { lang: b.lang, address: CONFIG.address })
    };
  }

  function publicStatus(b) {
    var services = JSON.parse(b.services_json);
    var ok = b.status === "confirmed" || b.status === "completed";
    return {
      id: b.id, status: b.status, mode: b.mode, lang: b.lang, date: b.date, start: b.start,
      services: services.map(function (s) { return { id: s.id, name: s.name, priceCents: s.priceCents }; }),
      totalCents: b.total_cents, depositCents: b.deposit_cents, restCents: b.total_cents - b.deposit_cents,
      giftName: b.mode === "gift" ? b.gift_name : undefined,
      giftCode: ok ? (b.gift_code || undefined) : undefined,
      holdExpiresAt: b.status === "pending_payment" ? b.hold_expires_at : undefined,
      calendar: b.status === "confirmed" ? calendarLinks(b) : undefined,
      paidFull: !!b.pay_full,
      clientName: b.mode === "gift" ? b.client_name : undefined,
      giftMessage: b.mode === "gift" ? (b.gift_message || undefined) : undefined
    };
  }

  /* ---------- Rutas ---------- */

  function route(method, path, query, body) {
    expireHolds();
    var m;

    if (method === "GET" && path === "catalog") {
      return {
        depositRate: CONFIG.depositRate,
        categories: catalog.categories,
        services: catalog.services.map(function (s) {
          return { id: s.id, cat: s.cat, price: s.price, duration: s.duration, slotMinutes: s.slotMinutes, name: s.name, sub: s.sub, desc: s.desc };
        })
      };
    }

    if (method === "GET" && path === "availability") {
      var ym = query.get("month") || "";
      var minutes = parseInt(query.get("minutes"), 10);
      if (!/^\d{4}-\d{2}$/.test(ym)) throw err(400, "invalid_month");
      var y = +ym.slice(0, 4), mo = +ym.slice(5, 7);
      var n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      var days = [];
      for (var d = 1; d <= n; d++) {
        var key = ym + "-" + String(d).padStart(2, "0");
        var r = day(key, minutes);
        days.push({ date: key, status: r.status, free: r.slots.length, holiday: r.holiday || undefined });
      }
      return { month: ym, first: cal.addDays(today(), 1), last: cal.addDays(today(), CONFIG.windowDays), days: days };
    }

    if (method === "GET" && path === "availability/day") {
      var date = query.get("date") || "";
      if (!cal.isDate(date)) throw err(400, "invalid_date");
      return day(date, parseInt(query.get("minutes"), 10));
    }

    if (method === "POST" && path === "bookings") {
      var v = validate(body || {});
      var avail = day(v.date, v.sel.minutes);
      if (avail.slots.indexOf(v.start) === -1) throw err(409, "slot_unavailable");
      var total = v.sel.totalCents;
      var b = {
        id: randomId(9), token: randomId(18), status: "pending_payment", created_at: nowIso(),
        hold_expires_at: new Date(Date.now() + CONFIG.holdMinutes * 60000).toISOString(),
        lang: v.lang, mode: v.mode, date: v.date, start: v.start,
        end: cal.toTime(cal.toMin(v.start) + v.sel.minutes), minutes: v.sel.minutes,
        services_json: JSON.stringify(v.sel.items.map(function (s) {
          return { id: s.id, name: s.name, priceCents: Math.round(s.price * 100), minutes: s.slotMinutes };
        })),
        total_cents: total, deposit_cents: v.payFull ? total : Math.round(total * CONFIG.depositRate), pay_full: v.payFull ? 1 : 0,
        client_name: v.client.name, client_email: v.client.email, client_phone: v.client.phone,
        gift_name: v.gift && v.gift.name, gift_age: v.gift && v.gift.age,
        gift_email: v.gift && v.gift.email, gift_message: v.gift && v.gift.message
      };
      memory[b.id] = b; save();
      return { id: b.id, token: b.token, paymentUrl: paymentUrl(b), _status: 201 };
    }

    if ((m = path.match(/^bookings\/([^/]+)$/)) && method === "GET") {
      return publicStatus(find(m[1], query.get("t") || ""));
    }

    if ((m = path.match(/^bookings\/([^/]+)\/pay$/)) && method === "POST") {
      var bk = find(m[1], (body && body.t) || "");
      if (bk.status === "confirmed" || bk.status === "completed") throw err(409, "not_payable");
      if (bk.status !== "pending_payment") {
        var again = day(bk.date, bk.minutes, bk.id);
        if (again.slots.indexOf(bk.start) === -1) throw err(409, "slot_unavailable");
        bk.status = "pending_payment";
        bk.hold_expires_at = new Date(Date.now() + CONFIG.holdMinutes * 60000).toISOString();
        save();
      }
      return { paymentUrl: paymentUrl(bk) };
    }

    if ((m = path.match(/^dev\/mock-pay\/([^/]+)$/)) && method === "GET") {
      var pb = find(m[1], query.get("t") || "");
      return { depositCents: pb.deposit_cents, status: pb.status, date: pb.date, start: pb.start };
    }

    if (method === "POST" && path === "dev/mock-pay") {
      var p = find(body && body.id, body && body.t);
      if (p.status === "pending_payment") {
        if (body.result === "ok") {
          p.status = "confirmed";
          if (p.mode === "gift") p.gift_code = giftCode();
        } else {
          p.status = "payment_failed";
        }
        save();
      }
      return { ok: true };
    }

    throw err(404, "not_found");
  }

  /* ---------- Intercepta fetch ---------- */

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = new URL(typeof input === "string" ? input : input.url, location.href);
    var i = url.pathname.indexOf("/api/");
    if (i === -1) return realFetch(input, init);
    var path = url.pathname.slice(i + 5);
    var method = ((init && init.method) || "GET").toUpperCase();
    var body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }

    return new Promise(function (resolve) {
      setTimeout(function () {
        var status = 200, data;
        try {
          data = route(method, path, url.searchParams, body);
          if (data && data._status) { status = data._status; delete data._status; }
        } catch (e) {
          status = e.status || 500;
          data = e.body || { error: "server_error" };
          if (!e.status) console.error(e);
        }
        resolve(new Response(JSON.stringify(data), { status: status, headers: { "Content-Type": "application/json" } }));
      }, 250);
    });
  };

  /* ---------- Aviso de demo ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    var bar = document.createElement("div");
    bar.className = "demo-banner";
    bar.setAttribute("role", "note");
    bar.innerHTML = "<strong>Démo</strong> · Version de présentation : aucun paiement réel, aucun e-mail envoyé.";
    document.body.insertBefore(bar, document.body.firstChild);
  });
})();
