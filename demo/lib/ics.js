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
