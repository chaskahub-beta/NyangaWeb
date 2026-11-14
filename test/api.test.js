"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../server/index");
const { loadConfig } = require("../server/config");

// Reloj controlable: samedi 14 novembre 2026, 11:00 à Paris
let now = new Date("2026-11-14T10:00:00Z");
const clock = { now: () => now };

const outbox = fs.mkdtempSync(path.join(os.tmpdir(), "nyanga-outbox-"));
const config = loadConfig({
  dbPath: ":memory:",
  outboxDir: outbox,
  adminPassword: "secret-test",
  sessionSecret: "test-secret",
  publicUrl: "http://localhost",
  sumup: { apiKey: "", merchantCode: "", apiBase: "" },
  mail: { host: "", from: "test@localhost", companyEmail: "spa@example.com" }
});
config.paymentsMode = "mock";
config.mailMode = "outbox";

const ctx = createApp({ config, clock });
let server, base;

test.before(async () => {
  await new Promise((r) => { server = ctx.app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => { server.close(); ctx.close(); });

async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

const DAY = "2026-11-16"; // lundi

function bookingBody(extra = {}) {
  return {
    lang: "fr",
    mode: "me",
    services: ["relaxant"],
    date: DAY,
    start: "09:30",
    client: { name: "Marie Dupont", email: "marie@example.com", phone: "06 12 34 56 78" },
    acceptDeposit: true,
    ...extra
  };
}

function outboxFiles() { return fs.readdirSync(outbox).filter((n) => n.endsWith(".html")); }
function outboxIcs() { return fs.readdirSync(outbox).filter((n) => n.endsWith(".ics")); }

async function pay(created, result = "ok") {
  return call("POST", "/api/dev/mock-pay", { id: created.id, t: created.token, result });
}

test("catalogue", async () => {
  const r = await call("GET", "/api/catalog");
  assert.equal(r.status, 200);
  assert.equal(r.data.services.length, 11);
  assert.equal(r.data.depositRate, 0.2);
});

test("disponibilités du mois", async () => {
  const r = await call("GET", "/api/availability?month=2026-11&minutes=60");
  assert.equal(r.status, 200);
  const byDate = Object.fromEntries(r.data.days.map((d) => [d.date, d.status]));
  assert.equal(byDate["2026-11-14"], "out");
  assert.equal(byDate["2026-11-15"], "closed");
  assert.equal(byDate["2026-11-16"], "open");
  assert.equal(byDate["2026-11-21"], "closed");
});

test("validation : champs manquants et acompte non accepté", async () => {
  const r = await call("POST", "/api/bookings", bookingBody({
    client: { name: "M", email: "pas-un-mail", phone: "12" }, acceptDeposit: false
  }));
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.fields.sort(), ["acceptDeposit", "client.email", "client.name", "client.phone"]);
});

test("validation : soin inconnu, créneau hors horaire, week-end", async () => {
  assert.equal((await call("POST", "/api/bookings", bookingBody({ services: ["inconnu"] }))).data.error, "unknown_service");
  assert.equal((await call("POST", "/api/bookings", bookingBody({ start: "09:45" }))).status, 409);
  assert.equal((await call("POST", "/api/bookings", bookingBody({ date: "2026-11-21" }))).status, 409);
});

test("réservation pour moi : paiement, confirmation et e-mails", async () => {
  const before = outboxFiles().length;
  const icsBefore = outboxIcs().length;
  const created = await call("POST", "/api/bookings", bookingBody({ services: ["signature", "headspa-voyage"], start: "10:00", price: 1 }));
  assert.equal(created.status, 201);
  const icsUrl = `/api/bookings/${created.data.id}/calendar.ics?t=${created.data.token}`;
  assert.equal((await fetch(base + icsUrl)).status, 404, "pas d'agenda avant paiement");
  assert.match(created.data.paymentUrl, /paiement-demo\.html/);

  let s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "pending_payment");
  assert.equal(s.data.totalCents, 15500, "le prix vient du serveur, pas du client");
  assert.equal(s.data.depositCents, 3100);
  assert.equal(s.data.restCents, 12400);

  // Le créneau est retenu pendant le paiement
  const clash = await call("POST", "/api/bookings", bookingBody({ start: "10:30" }));
  assert.equal(clash.status, 409);

  assert.equal((await pay(created.data)).status, 200);
  s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "confirmed");
  assert.equal(s.data.giftCode, undefined);
  assert.equal(outboxFiles().length - before, 2, "cliente + entreprise");
  assert.equal(outboxIcs().length - icsBefore, 2, ".ics joint aux deux e-mails");

  // Ajouter à l'agenda : lien .ics + Google
  assert.ok(s.data.calendar.ics.endsWith(icsUrl));
  assert.match(s.data.calendar.google, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  assert.match(s.data.calendar.google, /dates=20261116T090000Z%2F20261116T114000Z/);
  const ics = await fetch(base + icsUrl);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  const body = await ics.text();
  assert.match(body, /DTSTART:20261116T090000Z/, "10:00 à Paris = 09:00 UTC en hiver");
  assert.match(body, /TRIGGER:-P1D/);
  assert.match(body, /TRIGGER:-PT2H/);
  assert.equal((await fetch(base + `/api/bookings/${created.data.id}/calendar.ics?t=faux`)).status, 404);

  // Payer deux fois n'envoie pas de nouveaux e-mails
  await pay(created.data);
  assert.equal(outboxFiles().length - before, 2);
});

test("mauvais jeton = introuvable", async () => {
  const created = await call("POST", "/api/bookings", bookingBody({ start: "15:00" }));
  const r = await call("GET", `/api/bookings/${created.data.id}?t=faux`);
  assert.equal(r.status, 404);
});

test("carte cadeau : code unique, 3 e-mails, validité à la date", async () => {
  const before = outboxFiles().length;
  const created = await call("POST", "/api/bookings", bookingBody({
    mode: "gift",
    start: "16:30",
    services: ["hammam"],
    gift: { name: "Claire Martin", age: 34, email: "claire@example.com", message: "Joyeux anniversaire" }
  }));
  assert.equal(created.status, 201);
  await pay(created.data);

  const s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "confirmed");
  assert.match(s.data.giftCode, /^NYG-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(outboxFiles().length - before, 3, "acheteur + bénéficiaire + entreprise");

  // Panel : recherche et validation du code
  const login = await call("POST", "/api/admin/login", { password: "secret-test" });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const code = s.data.giftCode.toLowerCase().replace(/-/g, " ");
  const look = await call("GET", `/api/admin/gift/${encodeURIComponent(code)}`, null, { Cookie: cookie });
  assert.equal(look.status, 200);
  assert.equal(look.data.validToday, false);

  const early = await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, { Cookie: cookie });
  assert.equal(early.data.error, "wrong_date");

  now = new Date("2026-11-16T09:00:00Z"); // le jour du rendez-vous
  const expired = await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, { Cookie: cookie });
  assert.equal(expired.status, 401, "la session du panel expire après 12 h");
  const relogin = await call("POST", "/api/admin/login", { password: "secret-test" });
  const fresh = relogin.headers.get("set-cookie").split(";")[0];
  const ok = await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, { Cookie: fresh });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.redeemed, true);
  const again = await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, { Cookie: fresh });
  assert.equal(again.data.error, "already_redeemed");
  now = new Date("2026-11-14T10:00:00Z");
});

test("carte cadeau : données du bénéficiaire obligatoires", async () => {
  const r = await call("POST", "/api/bookings", bookingBody({ mode: "gift", start: "13:30", gift: { name: "", age: 0, email: "x" } }));
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.fields.sort(), ["gift.age", "gift.email", "gift.name"]);
});

test("paiement refusé libère le créneau, puis nouvel essai", async () => {
  const created = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-17", start: "09:30" }));
  await pay(created.data, "fail");
  const s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "payment_failed");

  const day = await call("GET", "/api/availability/day?date=2026-11-17&minutes=60");
  assert.ok(day.data.slots.includes("09:30"));

  const retry = await call("POST", `/api/bookings/${created.data.id}/pay`, { t: created.data.token });
  assert.equal(retry.status, 200);
  assert.ok(retry.data.paymentUrl);
  await pay(created.data);
  const s2 = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s2.data.status, "confirmed");
});

test("la retenue expire après 30 min ; un paiement tardif est signalé", async () => {
  const first = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-18", start: "09:30" }));
  now = new Date(now.getTime() + 31 * 60000);

  const second = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-18", start: "09:30" }));
  assert.equal(second.status, 201, "le créneau est de nouveau libre");
  await pay(second.data);

  await pay(first.data); // la première cliente paie quand même, en retard
  const login = await call("POST", "/api/admin/login", { password: "secret-test" });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const b = await call("GET", `/api/admin/bookings/${first.data.id}`, null, { Cookie: cookie });
  assert.equal(b.data.status, "confirmed");
  assert.equal(b.data.needs_attention, 1);
  now = new Date("2026-11-14T10:00:00Z");
});

test("panel : connexion, blocage d'un jour, réglages, actions", async () => {
  assert.equal((await call("GET", "/api/admin/bookings")).status, 401);
  assert.equal((await call("POST", "/api/admin/login", { password: "faux" })).status, 401);

  const login = await call("POST", "/api/admin/login", { password: "secret-test" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const H = { Cookie: cookie };

  const block = await call("POST", "/api/admin/blocks", { date: "2026-11-19", reason: "Formation" }, H);
  assert.equal(block.status, 201);
  const day = await call("GET", "/api/availability/day?date=2026-11-19&minutes=60");
  assert.equal(day.data.status, "blocked");
  await call("DELETE", `/api/admin/blocks/${block.data.id}`, null, H);
  assert.equal((await call("GET", "/api/availability/day?date=2026-11-19&minutes=60")).data.status, "open");

  // Ouvrir le samedi
  const bad = await call("PUT", "/api/admin/settings", { openingHours: { 6: [["12:00", "10:00"]] } }, H);
  assert.equal(bad.status, 400);
  const good = await call("PUT", "/api/admin/settings", { openingHours: { 1: [["09:30", "18:30"]], 2: [["09:30", "18:30"]], 3: [["09:30", "18:30"]], 4: [["09:30", "18:30"]], 5: [["09:30", "18:30"]], 6: [["10:00", "14:00"]] } }, H);
  assert.equal(good.status, 200);
  assert.equal((await call("GET", "/api/availability/day?date=2026-11-21&minutes=60")).data.status, "open");

  // Terminer un rendez-vous
  const list = await call("GET", "/api/admin/bookings?from=2026-11-16&to=2026-11-16", null, H);
  const confirmed = list.data.find((b) => b.status === "confirmed");
  const done = await call("POST", `/api/admin/bookings/${confirmed.id}/action`, { action: "complete" }, H);
  assert.equal(done.data.status, "completed");
  assert.ok(done.data.balance_paid_at);
  assert.equal(done.data.token, undefined, "le jeton client ne sort pas dans le panel");
});
