"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const cal = require("../server/calendar");
const { DEFAULT_SETTINGS } = require("../server/db");

const base = {
  settings: DEFAULT_SETTINGS,
  blocks: [],
  busy: [],
  today: "2026-11-14", // samedi
  windowDays: 90
};

test("Pâques et jours fériés français", () => {
  assert.equal(cal.easter(2026), "2026-04-05");
  assert.equal(cal.easter(2027), "2027-03-28");
  assert.equal(cal.holidayName("2026-04-06"), "Lundi de Pâques");
  assert.equal(cal.holidayName("2026-05-14"), "Ascension");
  assert.equal(cal.holidayName("2026-05-25"), "Lundi de Pentecôte");
  assert.equal(cal.holidayName("2026-12-25"), "Noël");
  assert.equal(cal.holidayName("2026-12-24"), null);
});

test("heure de Paris", () => {
  // 23:30 UTC le 14 = 00:30 le 15 à Paris (heure d'hiver)
  assert.deepEqual(cal.parisNow(new Date("2026-11-14T23:30:00Z")), { date: "2026-11-15", minutes: 30 });
});

test("jour ouvert sans réservation : créneaux de 09:30 à 17:30 pour 60 min", () => {
  const r = cal.dayAvailability("2026-11-16", 60, base);
  assert.equal(r.status, "open");
  assert.equal(r.slots[0], "09:30");
  assert.equal(r.slots.at(-1), "17:30");
  assert.equal(r.slots.length, 17);
});

test("une réservation bloque son créneau et la pause de 15 min", () => {
  const r = cal.dayAvailability("2026-11-16", 60, { ...base, busy: [{ start: "10:00", end: "11:00" }] });
  assert.ok(!r.slots.includes("09:30"), "09:30-10:30 chevauche");
  assert.ok(!r.slots.includes("10:30"));
  assert.ok(!r.slots.includes("11:00"), "pas de pause avant 11:15");
  assert.ok(r.slots.includes("11:30"));
});

test("la pause est respectée avant une réservation", () => {
  // 90 min qui finit à 11:00 avec pause 15 → doit finir avant 10:45
  const r = cal.dayAvailability("2026-11-16", 60, { ...base, busy: [{ start: "11:00", end: "12:00" }] });
  assert.ok(r.slots.includes("09:30"), "09:30-10:30 + 15 = 10:45 ≤ 11:00");
  assert.ok(!r.slots.includes("10:00"), "10:00-11:00 sans pause");
});

test("week-end, jour férié, hors fenêtre, jour bloqué", () => {
  assert.equal(cal.dayAvailability("2026-11-21", 60, base).status, "closed");
  assert.equal(cal.dayAvailability("2026-12-25", 60, base).status, "holiday");
  assert.equal(cal.dayAvailability("2026-11-14", 60, base).status, "out", "aujourd'hui n'est pas réservable");
  assert.equal(cal.dayAvailability("2027-03-01", 60, base).status, "out", "au-delà de 90 jours");
  assert.equal(cal.dayAvailability("2026-11-16", 60, { ...base, blocks: [{ start: null, end: null }] }).status, "blocked");
});

test("blocage partiel retire seulement les heures concernées", () => {
  const r = cal.dayAvailability("2026-11-16", 60, { ...base, blocks: [{ start: "14:00", end: "16:00" }] });
  assert.ok(r.slots.includes("13:00"));
  assert.ok(!r.slots.includes("13:30"));
  assert.ok(!r.slots.includes("15:00"));
  assert.ok(r.slots.includes("16:00"));
});

test("journée complète si la durée ne rentre pas", () => {
  const r = cal.dayAvailability("2026-11-16", 600, base);
  assert.equal(r.status, "full");
});

test("validation des dates", () => {
  assert.equal(cal.isDate("2026-02-30"), false);
  assert.equal(cal.isDate("2026-02-28"), true);
  assert.equal(cal.isTime("24:00"), false);
  assert.equal(cal.isTime("09:30"), true);
});
