"use strict";

const crypto = require("crypto");
const cal = require("./calendar");
const { priceSelection } = require("./catalog");
const { getSettings, tx } = require("./db");
const { confirmationEmails, cancellationEmail } = require("./mailer");
const { buildIcs, calendarLinks } = require("./ics");

class AppError extends Error {
  constructor(code, status = 400, extra) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

// Estados que ocupan la agenda (además de pending_payment con retención vigente)
const OCCUPYING = ["confirmed", "completed", "no_show"];

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

function cleanText(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function randomId(bytes) { return crypto.randomBytes(bytes).toString("base64url"); }

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomGiftCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `NYG-${s.slice(0, 4)}-${s.slice(4)}`;
}

function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NYG/, "");
}

function createBookingService({ db, config, payments, mailer, clock = { now: () => new Date() } }) {

  const nowIso = () => clock.now().toISOString();
  const today = () => cal.parisNow(clock.now(), config.timezone).date;

  const q = {
    get: db.prepare("SELECT * FROM bookings WHERE id = ?"),
    byCheckout: db.prepare("SELECT * FROM bookings WHERE checkout_id = ?"),
    byCode: db.prepare("SELECT * FROM bookings WHERE gift_code = ?"),
    busy: db.prepare(`SELECT id, start, end FROM bookings
      WHERE date = ? AND (status IN ('confirmed','completed','no_show')
        OR (status = 'pending_payment' AND hold_expires_at > ?))`),
    blocksOn: db.prepare("SELECT id, date, start, end, reason FROM blocks WHERE date = ?"),
    blocksRange: db.prepare("SELECT id, date, start, end, reason FROM blocks WHERE date BETWEEN ? AND ? ORDER BY date, start"),
    expire: db.prepare("UPDATE bookings SET status = 'expired', updated_at = ? WHERE status = 'pending_payment' AND hold_expires_at <= ?")
  };

  function find(id) {
    const b = q.get.get(id);
    if (!b) throw new AppError("not_found", 404);
    return b;
  }

  function findWithToken(id, token) {
    const b = q.get.get(String(id || ""));
    if (!b || typeof token !== "string" ||
        b.token.length !== token.length ||
        !crypto.timingSafeEqual(Buffer.from(b.token), Buffer.from(token))) {
      throw new AppError("not_found", 404);
    }
    return b;
  }

  function update(id, fields) {
    const keys = Object.keys(fields);
    const sql = `UPDATE bookings SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`;
    db.prepare(sql).run(...keys.map((k) => fields[k]), nowIso(), id);
  }

  function expireHolds() {
    const n = nowIso();
    q.expire.run(n, n);
  }

  /* ---------------- Disponibilidad ---------------- */

  function dayContext(date, excludeId) {
    return {
      settings: getSettings(db),
      blocks: q.blocksOn.all(date),
      busy: q.busy.all(date, nowIso()).filter((b) => b.id !== excludeId),
      today: today(),
      windowDays: config.bookingWindowDays
    };
  }

  function day(date, minutes, excludeId) {
    if (!cal.isDate(date)) throw new AppError("invalid_date");
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600) throw new AppError("invalid_duration");
    return cal.dayAvailability(date, minutes, dayContext(date, excludeId));
  }

  function month(ym, minutes) {
    if (!/^\d{4}-\d{2}$/.test(ym)) throw new AppError("invalid_month");
    const [y, m] = ym.split("-").map(Number);
    if (m < 1 || m > 12) throw new AppError("invalid_month");
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${ym}-${String(d).padStart(2, "0")}`;
      const r = day(key, minutes);
      days.push({ date: key, status: r.status, free: r.slots.length, holiday: r.holiday || undefined });
    }
    return {
      month: ym,
      first: cal.addDays(today(), 1),
      last: cal.addDays(today(), config.bookingWindowDays),
      days
    };
  }

  /* ---------------- Validación ---------------- */

  function validate(input) {
    const lang = input.lang === "en" ? "en" : "fr";
    const mode = input.mode;
    if (mode !== "me" && mode !== "gift") throw new AppError("invalid_mode");

    let sel;
    try { sel = priceSelection(input.services); }
    catch (e) { throw new AppError(e.message); }

    if (!cal.isDate(input.date)) throw new AppError("invalid_date");
    if (!cal.isTime(input.start)) throw new AppError("invalid_time");

    const c = input.client || {};
    const client = {
      name: cleanText(c.name, 100),
      email: cleanText(c.email, 254).toLowerCase(),
      phone: cleanText(c.phone, 30)
    };
    const fields = [];
    if (client.name.length < 2) fields.push("client.name");
    if (!EMAIL_RE.test(client.email)) fields.push("client.email");
    const digits = client.phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15 || /[^\d\s+().-]/.test(client.phone)) fields.push("client.phone");

    let gift = null;
    if (mode === "gift") {
      const g = input.gift || {};
      gift = {
        name: cleanText(g.name, 100),
        age: Number(g.age),
        email: cleanText(g.email, 254).toLowerCase(),
        message: cleanText(g.message, 300)
      };
      if (gift.name.length < 2) fields.push("gift.name");
      if (!Number.isInteger(gift.age) || gift.age < 1 || gift.age > 120) fields.push("gift.age");
      if (!EMAIL_RE.test(gift.email)) fields.push("gift.email");
    }

    if (input.acceptDeposit !== true) fields.push("acceptDeposit");
    if (fields.length) throw new AppError("invalid_fields", 400, { fields });

    return { lang, mode, sel, date: input.date, start: input.start, client, gift };
  }

  /* ---------------- Reserva ---------------- */

  function description(b) {
    return `Acompte 20 % Nyanga Beauty · ${b.date} ${b.start}`;
  }

  async function startPayment(b, attempt) {
    try {
      const checkout = await payments.createCheckout(b, `${b.id}-${attempt}`, description(b));
      update(b.id, { checkout_id: checkout.id, payment_status: "PENDING" });
      return checkout.url;
    } catch (err) {
      console.error("[sumup] création du paiement échouée:", err.message, err.details || "");
      update(b.id, { status: "payment_failed", hold_expires_at: null });
      throw new AppError("payment_unavailable", 502);
    }
  }

  async function create(input) {
    const v = validate(input || {});
    expireHolds();

    const id = randomId(9);
    const token = randomId(18);
    const totalCents = v.sel.totalCents;
    const depositCents = Math.round(totalCents * config.depositRate);
    const end = cal.toTime(cal.toMin(v.start) + v.sel.minutes);
    const hold = new Date(clock.now().getTime() + config.holdMinutes * 60000).toISOString();
    const services = v.sel.items.map((s) => ({ id: s.id, name: s.name, priceCents: Math.round(s.price * 100), minutes: s.slotMinutes }));

    tx(db, () => {
      const avail = day(v.date, v.sel.minutes);
      if (!avail.slots.includes(v.start)) throw new AppError("slot_unavailable", 409);
      const n = nowIso();
      db.prepare(`INSERT INTO bookings (id, token, created_at, lang, mode, date, start, end, minutes, services_json,
          total_cents, deposit_cents, client_name, client_email, client_phone, gift_name, gift_age, gift_email,
          gift_message, status, hold_expires_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, token, n, v.lang, v.mode, v.date, v.start, end, v.sel.minutes, JSON.stringify(services),
        totalCents, depositCents, v.client.name, v.client.email, v.client.phone,
        v.gift ? v.gift.name : null, v.gift ? v.gift.age : null, v.gift ? v.gift.email : null,
        v.gift ? (v.gift.message || null) : null, "pending_payment", hold, n
      );
    });

    const url = await startPayment(find(id), 1);
    return { id, token, paymentUrl: url };
  }

  /** Reintenta el pago si el horario sigue libre. */
  async function retryPayment(id, token) {
    const b = findWithToken(id, token);
    if (!["pending_payment", "payment_failed", "expired"].includes(b.status)) throw new AppError("not_payable", 409);

    // Si el pago anterior ya entró, no se cobra dos veces
    await sync(b);
    const fresh = find(id);
    if (fresh.status === "confirmed") return { paymentUrl: null, status: "confirmed" };

    const hold = new Date(clock.now().getTime() + config.holdMinutes * 60000).toISOString();
    tx(db, () => {
      expireHolds();
      const avail = day(fresh.date, fresh.minutes, fresh.id);
      if (!avail.slots.includes(fresh.start)) throw new AppError("slot_unavailable", 409);
      update(fresh.id, { status: "pending_payment", hold_expires_at: hold });
    });
    // Cada intento necesita una referencia nueva en SumUp
    const url = await startPayment(find(id), "r" + randomId(4));
    return { paymentUrl: url, status: "pending_payment" };
  }

  /** Consulta el estado real del pago en SumUp y actualiza la reserva. */
  async function sync(b) {
    if (!b.checkout_id || !["pending_payment", "expired", "payment_failed"].includes(b.status)) return b;
    let c;
    try { c = await payments.getCheckout(b.checkout_id); }
    catch (err) {
      console.error("[sumup] lecture du paiement échouée:", err.message);
      return b;
    }

    if (c.status === "PAID") {
      const expected = b.deposit_cents / 100;
      if (Math.abs(Number(c.amount) - expected) > 0.001 || (c.currency && c.currency !== "EUR")) {
        update(b.id, { payment_status: "AMOUNT_MISMATCH", needs_attention: 1 });
        console.error("[sumup] montant inattendu pour", b.id, c);
        return find(b.id);
      }
      await confirm(b.id);
    } else if (c.status === "FAILED" && b.status === "pending_payment") {
      update(b.id, { status: "payment_failed", payment_status: "FAILED", hold_expires_at: null });
    } else if (c.status === "EXPIRED" && b.status === "pending_payment") {
      update(b.id, { status: "expired", payment_status: "EXPIRED", hold_expires_at: null });
    }
    return find(b.id);
  }

  async function confirm(id) {
    const confirmedNow = tx(db, () => {
      const b = find(id);
      if (b.status === "confirmed" || OCCUPYING.includes(b.status) || b.status === "cancelled") return false;

      // Si la retención ya había caducado, el horario pudo ocuparse
      const avail = day(b.date, b.minutes, b.id);
      const conflict = !avail.slots.includes(b.start);

      let code = null;
      if (b.mode === "gift") {
        do { code = randomGiftCode(); } while (q.byCode.get(code));
      }
      update(id, {
        status: "confirmed",
        payment_status: "PAID",
        paid_at: nowIso(),
        hold_expires_at: null,
        gift_code: code,
        needs_attention: conflict ? 1 : b.needs_attention
      });
      return true;
    });
    if (confirmedNow) await sendConfirmation(id);
  }

  function mailOpts() {
    return { companyEmail: config.mail.companyEmail, publicUrl: config.publicUrl, address: config.businessAddress };
  }

  /** Archivo .ics para "Ajouter à mon agenda" (solo reservas confirmadas). */
  function calendarFile(id, token) {
    const b = findWithToken(id, token);
    if (b.status !== "confirmed" && b.status !== "completed") throw new AppError("not_found", 404);
    return buildIcs(b, { lang: b.lang, address: config.businessAddress, now: clock.now() });
  }

  async function sendConfirmation(id) {
    const b = find(id);
    try {
      await mailer.sendAll(confirmationEmails(b, mailOpts()));
      update(id, { emails_sent_at: nowIso() });
      return true;
    } catch {
      update(id, { needs_attention: 1 });
      return false;
    }
  }

  async function handleWebhook(body) {
    const checkoutId = body && (body.id || (body.payload && body.payload.checkout_id));
    if (!checkoutId || typeof checkoutId !== "string") return;
    const b = q.byCheckout.get(checkoutId);
    if (b) await sync(b);
  }

  async function publicStatus(id, token) {
    let b = findWithToken(id, token);
    b = await sync(b);
    const services = JSON.parse(b.services_json);
    return {
      id: b.id,
      status: b.status,
      mode: b.mode,
      lang: b.lang,
      date: b.date,
      start: b.start,
      services: services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents })),
      totalCents: b.total_cents,
      depositCents: b.deposit_cents,
      restCents: b.total_cents - b.deposit_cents,
      giftName: b.mode === "gift" ? b.gift_name : undefined,
      giftCode: b.status === "confirmed" || b.status === "completed" ? (b.gift_code || undefined) : undefined,
      holdExpiresAt: b.status === "pending_payment" ? b.hold_expires_at : undefined,
      calendar: b.status === "confirmed"
        ? calendarLinks(b, { publicUrl: config.publicUrl, address: config.businessAddress, lang: b.lang })
        : undefined
    };
  }

  /* ---------------- Panel de la empresa ---------------- */

  function adminView(b) {
    return { ...b, services: JSON.parse(b.services_json), services_json: undefined, token: undefined };
  }

  function list({ from, to, status } = {}) {
    expireHolds();
    const f = cal.isDate(from) ? from : today();
    const t = cal.isDate(to) ? to : cal.addDays(f, 60);
    let sql = "SELECT * FROM bookings WHERE date BETWEEN ? AND ?";
    const args = [f, t];
    if (status === "active") sql += " AND status IN ('confirmed','pending_payment')";
    else if (status && /^[a-z_]+$/.test(status)) { sql += " AND status = ?"; args.push(status); }
    else sql += " AND status NOT IN ('expired','payment_failed')";
    sql += " ORDER BY date, start";
    return db.prepare(sql).all(...args).map(adminView);
  }

  function get(id) { return adminView(find(id)); }

  async function adminAction(id, action, opts = {}) {
    const b = find(id);
    const n = nowIso();
    switch (action) {
      case "complete":
        if (!["confirmed", "no_show"].includes(b.status)) throw new AppError("invalid_transition", 409);
        update(id, { status: "completed", balance_paid_at: n });
        break;
      case "no_show":
        if (b.status !== "confirmed") throw new AppError("invalid_transition", 409);
        update(id, { status: "no_show" });
        break;
      case "cancel":
        if (!["confirmed", "pending_payment"].includes(b.status)) throw new AppError("invalid_transition", 409);
        update(id, { status: "cancelled", hold_expires_at: null });
        if (opts.notify && b.status === "confirmed") {
          try { await mailer.sendAll(cancellationEmail(find(id), mailOpts())); } catch { /* ya registrado */ }
        }
        break;
      case "reopen":
        if (!["completed", "no_show", "cancelled"].includes(b.status) || !b.paid_at) throw new AppError("invalid_transition", 409);
        update(id, { status: "confirmed", balance_paid_at: null });
        break;
      case "resolve":
        update(id, { needs_attention: 0 });
        break;
      case "note":
        update(id, { admin_note: cleanText(opts.note, 1000) || null });
        break;
      case "resend":
        if (!["confirmed", "completed"].includes(b.status)) throw new AppError("invalid_transition", 409);
        if (!(await sendConfirmation(id))) throw new AppError("mail_failed", 502);
        break;
      default:
        throw new AppError("invalid_action");
    }
    return get(id);
  }

  function giftLookup(code) {
    const norm = normalizeCode(code);
    if (norm.length !== 8) throw new AppError("not_found", 404);
    const b = q.byCode.get(`NYG-${norm.slice(0, 4)}-${norm.slice(4)}`);
    if (!b) throw new AppError("not_found", 404);
    const t = today();
    return {
      booking: adminView(b),
      validToday: b.date === t,
      expired: b.date < t,
      redeemed: !!b.gift_redeemed_at
    };
  }

  function giftRedeem(code, force) {
    const info = giftLookup(code);
    const b = info.booking;
    if (info.redeemed) throw new AppError("already_redeemed", 409);
    if (!["confirmed", "no_show"].includes(b.status)) throw new AppError("not_valid", 409);
    if (!info.validToday && !force) throw new AppError("wrong_date", 409, { date: b.date });
    update(b.id, { gift_redeemed_at: nowIso() });
    return giftLookup(code);
  }

  function blocks(from, to) {
    const f = cal.isDate(from) ? from : today();
    const t = cal.isDate(to) ? to : cal.addDays(f, 120);
    return q.blocksRange.all(f, t);
  }

  function addBlock({ date, start, end, reason }) {
    if (!cal.isDate(date)) throw new AppError("invalid_date");
    const whole = !start && !end;
    if (!whole) {
      if (!cal.isTime(start) || !cal.isTime(end) || cal.toMin(start) >= cal.toMin(end)) throw new AppError("invalid_time");
    }
    const r = db.prepare("INSERT INTO blocks (date, start, end, reason, created_at) VALUES (?,?,?,?,?)")
      .run(date, whole ? null : start, whole ? null : end, cleanText(reason, 200) || null, nowIso());

    // Reservas ya confirmadas que caen dentro del bloqueo (hay que avisarlas a mano)
    const affected = db.prepare("SELECT * FROM bookings WHERE date = ? AND status IN ('confirmed','pending_payment')").all(date)
      .filter((b) => whole || (cal.toMin(b.start) < cal.toMin(end) && cal.toMin(b.end) > cal.toMin(start)))
      .map(adminView);
    return { id: Number(r.lastInsertRowid), affected };
  }

  function removeBlock(id) {
    const r = db.prepare("DELETE FROM blocks WHERE id = ?").run(Number(id));
    if (!r.changes) throw new AppError("not_found", 404);
  }

  function adminMonth(ym) {
    if (!/^\d{4}-\d{2}$/.test(ym)) throw new AppError("invalid_month");
    const [y, m] = ym.split("-").map(Number);
    const settings = getSettings(db);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const first = `${ym}-01`, last = `${ym}-${String(daysInMonth).padStart(2, "0")}`;
    const rows = db.prepare(`SELECT date, COUNT(*) AS n FROM bookings
      WHERE date BETWEEN ? AND ? AND status IN ('confirmed','pending_payment','completed','no_show') GROUP BY date`).all(first, last);
    const counts = Object.fromEntries(rows.map((r) => [r.date, r.n]));
    const blockList = q.blocksRange.all(first, last);
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${ym}-${String(d).padStart(2, "0")}`;
      days.push({
        date: key,
        holiday: cal.holidayName(key),
        closed: (settings.openingHours[cal.weekday(key)] || []).length === 0,
        blocks: blockList.filter((b) => b.date === key),
        bookings: counts[key] || 0
      });
    }
    return { month: ym, today: today(), days };
  }

  return {
    day, month, create, retryPayment, sync, confirm, handleWebhook, publicStatus, expireHolds,
    list, get, adminAction, giftLookup, giftRedeem, blocks, addBlock, removeBlock, adminMonth,
    findWithToken, calendarFile
  };
}

module.exports = { createBookingService, AppError, randomGiftCode, normalizeCode };
