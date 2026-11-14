"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildIcs, googleUrl, parisToDate } = require("../server/ics");

const booking = {
  id: "ABC123", token: "tok", lang: "fr", mode: "gift",
  date: "2027-07-05", start: "14:00", end: "15:30",
  services_json: JSON.stringify([{ id: "headspa-voyage", name: { fr: "Head spa voyage, rituel; complet", en: "Head spa journey" }, priceCents: 9500 }]),
  total_cents: 9500, deposit_cents: 1900,
  client_name: "Paul", client_email: "paul@example.com", client_phone: "0600000000",
  gift_name: "Léa", gift_code: "NYG-AAAA-BBBB"
};

test("heure de Paris → UTC (hiver, été, changement d'heure)", () => {
  assert.equal(parisToDate("2026-11-16", "10:00").toISOString(), "2026-11-16T09:00:00.000Z");
  assert.equal(parisToDate("2027-07-05", "14:00").toISOString(), "2027-07-05T12:00:00.000Z");
  assert.equal(parisToDate("2027-03-29", "09:30").toISOString(), "2027-03-29T07:30:00.000Z"); // lendemain du passage à l'heure d'été
});

test(".ics : événement, rappels, texte échappé, lignes ≤ 75 octets", () => {
  const ics = buildIcs(booking, { lang: "fr", address: "Granges-Narboz", now: new Date("2027-01-01T00:00:00Z") });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /UID:ABC123@nyanga-beauty/);
  assert.match(ics, /DTSTART:20270705T120000Z/);
  assert.match(ics, /DTEND:20270705T133000Z/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /Head spa voyage\\, rituel\\; complet/);
  assert.match(unfolded, /NYG-AAAA-BBBB/);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test(".ics d'annulation : même UID, sans rappel", () => {
  const ics = buildIcs(booking, { lang: "fr", address: "x", cancel: true });
  assert.match(ics, /METHOD:CANCEL/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /UID:ABC123@nyanga-beauty/);
  assert.doesNotMatch(ics, /VALARM/);
});

test("agenda entreprise : nom du bénéficiaire et coordonnées", () => {
  const ics = buildIcs(booking, { lang: "fr", address: "x", audience: "company" }).replace(/\r\n /g, "");
  assert.match(ics, /SUMMARY:Léa · Head spa voyage/);
  assert.match(ics, /paul@example\.com/);
});

test("lien Google Agenda", () => {
  const u = new URL(googleUrl(booking, { lang: "en", address: "Granges-Narboz" }));
  assert.equal(u.searchParams.get("dates"), "20270705T120000Z/20270705T133000Z");
  assert.equal(u.searchParams.get("text"), "Nyanga Beauty & Spa · Head spa journey");
  assert.equal(u.searchParams.get("location"), "Granges-Narboz");
});
