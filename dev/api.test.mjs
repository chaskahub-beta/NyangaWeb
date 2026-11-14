// Pruebas de la versión PHP (las mismas que la versión Node), contra el entorno local de Docker:
//   docker compose -f dev/docker-compose.yml up -d --build
//   node --test dev/api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.NYANGA_URL || "http://localhost:8080";
const MAILPIT = process.env.MAILPIT_URL || "http://localhost:8025";
const ADMIN = "nyanga-dev";
const DEV = path.dirname(fileURLToPath(import.meta.url));

// Reloj controlable (cabecera X-Test-Now): samedi 14 novembre 2026, 11:00 à Paris
let now = new Date("2026-11-14T10:00:00Z");

function sql(q) {
  execFileSync("docker", ["compose", "-f", path.join(DEV, "docker-compose.yml"), "exec", "-T", "db",
    "mysql", "-unyanga", "-pnyanga-dev", "nyanga", "-e", q], { stdio: "pipe" });
}

test.before(async () => {
  sql("DELETE FROM bookings; DELETE FROM blocks; DELETE FROM settings; DELETE FROM rate_limits; DELETE FROM mock_checkouts;");
  await fetch(MAILPIT + "/api/v1/messages", { method: "DELETE" });
});

async function call(method, url, body, headers = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json", "X-Test-Now": now.toISOString(), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

async function mails() {
  const r = await fetch(MAILPIT + "/api/v1/messages?limit=200").then((x) => x.json());
  return r.messages || [];
}
const mailCount = async () => (await mails()).length;

const DAY = "2026-11-16"; // lundi

function bookingBody(extra = {}) {
  return {
    lang: "fr", mode: "me", services: ["relaxant"], date: DAY, start: "09:30",
    client: { name: "Marie Dupont", email: "marie@example.com", phone: "06 12 34 56 78" },
    acceptDeposit: true, ...extra
  };
}

const pay = (created, result = "ok") => call("POST", "/api/dev/mock-pay", { id: created.id, t: created.token, result });

async function login() {
  const r = await call("POST", "/api/admin/login", { password: ADMIN });
  assert.equal(r.status, 200);
  return { Cookie: r.headers.get("set-cookie").split(";")[0] };
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
  assert.equal(r.data.first, "2026-11-15");
  const dec = await call("GET", "/api/availability?month=2026-12&minutes=60");
  assert.equal(dec.data.days.find((d) => d.date === "2026-12-25").status, "holiday");
});

test("validation : champs manquants et acompte non accepté", async () => {
  const r = await call("POST", "/api/bookings", bookingBody({ client: { name: "M", email: "pas-un-mail", phone: "12" }, acceptDeposit: false }));
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.fields.sort(), ["acceptDeposit", "client.email", "client.name", "client.phone"]);
});

test("validation : soin inconnu, créneau hors horaire, week-end", async () => {
  assert.equal((await call("POST", "/api/bookings", bookingBody({ services: ["inconnu"] }))).data.error, "unknown_service");
  assert.equal((await call("POST", "/api/bookings", bookingBody({ start: "09:45" }))).status, 409);
  assert.equal((await call("POST", "/api/bookings", bookingBody({ date: "2026-11-21" }))).status, 409);
});

test("réservation pour moi : paiement, confirmation, e-mails et agenda", async () => {
  const before = await mailCount();
  const created = await call("POST", "/api/bookings", bookingBody({ services: ["signature", "headspa-voyage"], start: "10:00", price: 1 }));
  assert.equal(created.status, 201);
  assert.match(created.data.paymentUrl, /paiement-demo\.html/);
  const icsUrl = `/api/bookings/${created.data.id}/calendar.ics?t=${created.data.token}`;
  assert.equal((await fetch(BASE + icsUrl)).status, 404, "pas d'agenda avant paiement");

  let s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "pending_payment");
  assert.equal(s.data.totalCents, 15500, "le prix vient du serveur");
  assert.equal(s.data.depositCents, 3100);
  assert.equal(s.data.restCents, 12400);

  // Le créneau est retenu pendant le paiement
  assert.equal((await call("POST", "/api/bookings", bookingBody({ start: "10:30" }))).status, 409);

  assert.equal((await pay(created.data)).status, 200);
  s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "confirmed");
  assert.equal(s.data.giftCode, undefined);
  const list = await mails();
  assert.equal(list.length - before, 2, "cliente + entreprise");
  assert.ok(list.every((m) => m.Attachments >= 1), ".ics joint");
  const toClient = list.find((m) => m.To[0].Address === "marie@example.com");
  assert.equal(toClient.Subject, "Votre réservation chez Nyanga Beauty est confirmée");

  assert.ok(s.data.calendar.ics.endsWith(icsUrl));
  assert.match(s.data.calendar.google, /dates=20261116T090000Z%2F20261116T114000Z/);
  const ics = await fetch(BASE + icsUrl);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  const body = await ics.text();
  assert.match(body, /DTSTART:20261116T090000Z/, "10:00 à Paris = 09:00 UTC en hiver");
  assert.match(body, /TRIGGER:-P1D/);
  assert.match(body, /TRIGGER:-PT2H/);
  for (const line of body.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);

  // Payer deux fois n'envoie pas de nouveaux e-mails
  await pay(created.data);
  assert.equal((await mailCount()) - before, 2);
});

test("mauvais jeton = introuvable", async () => {
  const created = await call("POST", "/api/bookings", bookingBody({ start: "15:00" }));
  assert.equal((await call("GET", `/api/bookings/${created.data.id}?t=faux`)).status, 404);
});

test("carte cadeau : code unique, 3 e-mails, validité à la date", async () => {
  const before = await mailCount();
  const created = await call("POST", "/api/bookings", bookingBody({
    mode: "gift", start: "16:30", services: ["hammam"],
    gift: { name: "Claire Martin", age: 34, email: "claire@example.com", message: "Joyeux anniversaire" }
  }));
  assert.equal(created.status, 201);
  await pay(created.data);
  const s = await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`);
  assert.equal(s.data.status, "confirmed");
  assert.match(s.data.giftCode, /^NYG-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await mailCount()) - before, 3, "acheteur + bénéficiaire + entreprise");

  const H = await login();
  const code = s.data.giftCode.toLowerCase().replace(/-/g, " ");
  const look = await call("GET", `/api/admin/gift/${encodeURIComponent(code)}`, null, H);
  assert.equal(look.status, 200);
  assert.equal(look.data.validToday, false);
  assert.equal((await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, H)).data.error, "wrong_date");

  now = new Date("2026-11-16T09:00:00Z"); // le jour du rendez-vous
  assert.equal((await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, H)).status, 401, "session expirée après 12 h");
  const H2 = await login();
  const ok = await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, H2);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.redeemed, true);
  assert.equal((await call("POST", `/api/admin/gift/${s.data.giftCode}/redeem`, {}, H2)).data.error, "already_redeemed");
  now = new Date("2026-11-14T10:00:00Z");
});

test("option : tout payer à l'avance (pour moi et carte cadeau)", async () => {
  const me = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-20", start: "09:30", services: ["signature"], payFull: true }));
  assert.equal(me.status, 201);
  let s = await call("GET", `/api/bookings/${me.data.id}?t=${me.data.token}`);
  assert.equal(s.data.depositCents, 6000, "on paie le total");
  assert.equal(s.data.restCents, 0);
  assert.equal(s.data.paidFull, true);
  const before = await mails();
  await pay(me.data);
  const sent = (await mails()).slice(0, (await mails()).length - before.length);
  const toClient = sent.find((m) => m.To[0].Address === "marie@example.com");
  const html = await fetch(`${MAILPIT}/api/v1/message/${toClient.ID}`).then((r) => r.json()).then((m) => m.HTML);
  assert.match(html, /Payé en totalité/);
  assert.match(html, /Rien à régler sur place/);

  // Par défaut : acompte de 20 %
  const dep = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-20", start: "14:00", services: ["signature"] }));
  s = await call("GET", `/api/bookings/${dep.data.id}?t=${dep.data.token}`);
  assert.equal(s.data.depositCents, 1200);
  assert.equal(s.data.paidFull, false);

  // Carte cadeau payée en totalité : message pour le bénéficiaire
  const gift = await call("POST", "/api/bookings", bookingBody({
    mode: "gift", date: "2026-11-20", start: "16:00", services: ["hammam"], payFull: true,
    gift: { name: "Léa Petit", age: 29, email: "lea@example.com", message: "Bon anniversaire !" }
  }));
  await pay(gift.data);
  s = await call("GET", `/api/bookings/${gift.data.id}?t=${gift.data.token}`);
  assert.equal(s.data.paidFull, true);
  assert.equal(s.data.clientName, "Marie Dupont");
  assert.equal(s.data.giftMessage, "Bon anniversaire !");
  const buyer = (await mails()).find((m) => m.To[0].Address === "marie@example.com" && m.Subject === "Votre carte cadeau Nyanga Beauty");
  const bhtml = await fetch(`${MAILPIT}/api/v1/message/${buyer.ID}`).then((r) => r.json()).then((m) => m.HTML);
  assert.match(bhtml, /Envoyer la carte à Léa Petit/);
  assert.match(bhtml, /wa\.me\/\?text=/);
  assert.match(bhtml, /Tout est déjà réglé/);
});

test("carte cadeau : données du bénéficiaire obligatoires", async () => {
  const r = await call("POST", "/api/bookings", bookingBody({ mode: "gift", start: "13:30", gift: { name: "", age: 0, email: "x" } }));
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.fields.sort(), ["gift.age", "gift.email", "gift.name"]);
});

test("paiement refusé libère le créneau, puis nouvel essai", async () => {
  const created = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-17", start: "09:30" }));
  await pay(created.data, "fail");
  assert.equal((await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`)).data.status, "payment_failed");
  assert.ok((await call("GET", "/api/availability/day?date=2026-11-17&minutes=60")).data.slots.includes("09:30"));
  const retry = await call("POST", `/api/bookings/${created.data.id}/pay`, { t: created.data.token });
  assert.equal(retry.status, 200);
  assert.ok(retry.data.paymentUrl);
  await pay(created.data);
  assert.equal((await call("GET", `/api/bookings/${created.data.id}?t=${created.data.token}`)).data.status, "confirmed");
});

test("la retenue expire après 30 min ; un paiement tardif est signalé", async () => {
  const first = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-18", start: "09:30" }));
  now = new Date(now.getTime() + 31 * 60000);
  const second = await call("POST", "/api/bookings", bookingBody({ date: "2026-11-18", start: "09:30" }));
  assert.equal(second.status, 201, "le créneau est de nouveau libre");
  await pay(second.data);
  await pay(first.data); // la première cliente paie quand même, en retard
  const H = await login();
  const b = await call("GET", `/api/admin/bookings/${first.data.id}`, null, H);
  assert.equal(b.data.status, "confirmed");
  assert.equal(b.data.needs_attention, 1);
  now = new Date("2026-11-14T10:00:00Z");
});

test("panel : connexion, blocage d'un jour, réglages, actions", async () => {
  assert.equal((await call("GET", "/api/admin/bookings")).status, 401);
  assert.equal((await call("POST", "/api/admin/login", { password: "faux" })).status, 401);
  const H = await login();

  const block = await call("POST", "/api/admin/blocks", { date: "2026-11-19", reason: "Formation" }, H);
  assert.equal(block.status, 201);
  assert.equal((await call("GET", "/api/availability/day?date=2026-11-19&minutes=60")).data.status, "blocked");
  await call("DELETE", `/api/admin/blocks/${block.data.id}`, null, H);
  assert.equal((await call("GET", "/api/availability/day?date=2026-11-19&minutes=60")).data.status, "open");

  const cal = await call("GET", "/api/admin/calendar?month=2026-11", null, H);
  assert.equal(cal.data.days.find((d) => d.date === "2026-11-11").holiday, "Armistice");

  assert.equal((await call("PUT", "/api/admin/settings", { openingHours: { 6: [["12:00", "10:00"]] } }, H)).status, 400);
  const hours = { 1: [["09:30", "18:30"]], 2: [["09:30", "18:30"]], 3: [["09:30", "18:30"]], 4: [["09:30", "18:30"]], 5: [["09:30", "18:30"]], 6: [["10:00", "14:00"]] };
  const good = await call("PUT", "/api/admin/settings", { openingHours: hours }, H);
  assert.equal(good.status, 200);
  assert.deepEqual(good.data.openingHours["6"], [["10:00", "14:00"]]);
  assert.equal((await call("GET", "/api/availability/day?date=2026-11-21&minutes=60")).data.status, "open");

  const list = await call("GET", "/api/admin/bookings?from=2026-11-16&to=2026-11-16", null, H);
  const confirmed = list.data.find((b) => b.status === "confirmed");
  const done = await call("POST", `/api/admin/bookings/${confirmed.id}/action`, { action: "complete" }, H);
  assert.equal(done.data.status, "completed");
  assert.ok(done.data.balance_paid_at);
  assert.equal(done.data.token, undefined, "le jeton client ne sort pas dans le panel");

  // Annuler avec avis : e-mail d'annulation avec .ics CANCEL
  const before = await mailCount();
  const other = list.data.find((b) => b.status === "confirmed" && b.id !== confirmed.id);
  const c = await call("POST", `/api/admin/bookings/${other.id}/action`, { action: "cancel", notify: true }, H);
  assert.equal(c.data.status, "cancelled");
  assert.ok((await mailCount()) > before, "e-mail d'annulation envoyé");
});

test("panel : 5 mauvais mots de passe bloquent la connexion", async () => {
  for (let i = 0; i < 5; i++) await call("POST", "/api/admin/login", { password: "faux" });
  assert.equal((await call("POST", "/api/admin/login", { password: ADMIN })).status, 429);
  sql("DELETE FROM rate_limits;");
});

test("route inconnue et JSON invalide", async () => {
  assert.equal((await call("GET", "/api/nope")).status, 404);
  const r = await fetch(BASE + "/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oups" });
  assert.equal(r.status, 400);
});
