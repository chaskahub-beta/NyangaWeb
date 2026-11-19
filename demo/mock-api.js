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
    address: "Nyanga Beauty & Spa, 2 impasse des Charmilles, 25300 Granges-Narboz, France",
    settings: {
      openingHours: {
        0: [], 1: [],
        2: [["09:30", "12:00"], ["13:30", "16:00"], ["16:30", "19:30"]],
        3: [["09:00", "12:00"], ["13:30", "19:00"]],
        4: [["09:30", "12:00"], ["13:30", "16:00"], ["16:30", "19:30"]],
        5: [["09:00", "12:00"], ["13:30", "19:00"]],
        6: [["09:00", "12:00"], ["13:30", "19:00"]]
      },
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

  // Estado del panel de la demo: bloqueos, réglages y soins editados
  var SKEY = "nyanga-demo-state";
  var state = (function () { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
  state.blocks = state.blocks || [];
  state.nextBlock = state.nextBlock || 1;
  function saveState() { try { localStorage.setItem(SKEY, JSON.stringify(state)); } catch (e) { /* privado */ } }
  function settings() { return state.settings || CONFIG.settings; }

  /** Soins en formato del panel: los editados, o los de catalog.json */
  function adminServices() {
    if (state.services) return state.services;
    return CATALOG_DATA.services.map(function (s, i) {
      return {
        id: s.id, cat: s.cat, sort_order: i * 10, price: s.price, price_from: !!s.priceFrom,
        duration: s.duration, slot_minutes: s.slotMinutes,
        name_fr: s.name.fr, name_en: s.name.en || "", sub_fr: s.sub ? s.sub.fr : "", sub_en: s.sub ? s.sub.en : "",
        desc_fr: s.desc ? s.desc.fr : "", desc_en: s.desc ? s.desc.en : "", active: s.active !== false
      };
    });
  }
  function catOrder(c) { return CATALOG_DATA.categories.map(function (x) { return x.id; }).indexOf(c); }
  function sortServices(list) {
    return list.slice().sort(function (a, b) { return (catOrder(a.cat) - catOrder(b.cat)) || (a.sort_order - b.sort_order); });
  }
  /** Soins visibles en el sitio (formato público) */
  function publicServices() {
    return sortServices(adminServices()).filter(function (s) { return s.active; }).map(function (s) {
      var o = {
        id: s.id, cat: s.cat, price: s.price, priceFrom: !!s.price_from, duration: s.duration, slotMinutes: s.slot_minutes,
        name: { fr: s.name_fr, en: s.name_en || s.name_fr }, desc: { fr: s.desc_fr || "", en: s.desc_en || s.desc_fr || "" }
      };
      if (s.sub_fr) o.sub = { fr: s.sub_fr, en: s.sub_en || s.sub_fr };
      return o;
    });
  }
  function priceSelection(ids) {
    if (!Array.isArray(ids) || !ids.length) throw err(400, "services_required");
    var all = publicServices();
    var items = ids.map(function (id) {
      var s = all.filter(function (x) { return x.id === id; })[0];
      if (!s) throw err(400, "unknown_service");
      return s;
    });
    return {
      items: items,
      totalCents: items.reduce(function (n, s) { return n + Math.round(s.price * 100); }, 0),
      minutes: items.reduce(function (n, s) { return n + s.slotMinutes; }, 0)
    };
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
      return b.status === "confirmed" || b.status === "completed" || b.status === "no_show" ||
        (b.status === "pending_payment" && b.hold_expires_at > n);
    });
  }

  function day(date, minutes, excludeId) {
    return cal.dayAvailability(date, minutes, {
      settings: settings(), blocks: state.blocks.filter(function (b) { return b.date === date; }), busy: busyOn(date, excludeId),
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
    sel = priceSelection(input.services);
    if (mode === "me") {
      if (!cal.isDate(input.date)) throw err(400, "invalid_date");
      if (!cal.isTime(input.start)) throw err(400, "invalid_time");
    }
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
    return {
      lang: input.lang === "en" ? "en" : "fr", mode: mode, sel: sel,
      date: mode === "me" ? input.date : null, start: mode === "me" ? input.start : null,
      client: client, gift: gift, payFull: mode === "gift" || input.payFull === true
    };
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
      calendar: b.status === "confirmed" && b.date ? calendarLinks(b) : undefined,
      giftExpiresAt: ok && b.gift_code ? b.gift_expires_at : undefined,
      giftLink: ok && b.gift_code ? giftLink(b) : undefined,
      paidFull: !!b.pay_full,
      clientName: b.mode === "gift" ? b.client_name : undefined,
      giftMessage: b.mode === "gift" ? (b.gift_message || undefined) : undefined
    };
  }

  function giftLink(b) {
    return location.origin + location.pathname.replace(/admin\/[^/]*$/, "").replace(/[^/]*$/, "") + "?cadeau=" + encodeURIComponent(b.gift_code);
  }

  function plain(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function giftFor(code, name) {
    var norm = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NYG/, "");
    var full = "NYG-" + norm.slice(0, 4) + "-" + norm.slice(4);
    var b = Object.keys(memory).map(function (k) { return memory[k]; }).filter(function (x) { return x.gift_code === full; })[0];
    var given = plain(name), whole = b ? plain(b.gift_name) : "";
    if (!b || !given || (given !== whole && given !== whole.split(" ")[0])) throw err(404, "gift_not_found");
    return b;
  }

  function giftState(b) {
    if (b.status !== "confirmed") return b.status === "cancelled" ? "cancelled" : "not_paid";
    if (b.date) return "scheduled";
    if (b.gift_expires_at < today()) return "expired";
    return "open";
  }

  /* ---------- Rutas ---------- */

  function route(method, path, query, body) {
    expireHolds();
    var m;

    if (method === "GET" && path === "catalog") {
      return {
        depositRate: CONFIG.depositRate,
        categories: catalog.categories,
        services: publicServices(),
        hours: settings().openingHours
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
      if (v.mode === "me") {
        var avail = day(v.date, v.sel.minutes);
        if (avail.slots.indexOf(v.start) === -1) throw err(409, "slot_unavailable");
      }
      var total = v.sel.totalCents;
      var b = {
        id: randomId(9), token: randomId(18), status: "pending_payment", created_at: nowIso(),
        hold_expires_at: new Date(Date.now() + CONFIG.holdMinutes * 60000).toISOString(),
        lang: v.lang, mode: v.mode, date: v.date, start: v.start,
        end: v.start ? cal.toTime(cal.toMin(v.start) + v.sel.minutes) : null, minutes: v.sel.minutes,
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
        var again = bk.date ? day(bk.date, bk.minutes, bk.id) : { slots: [bk.start] };
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

    if (method === "POST" && path === "gift/verify") {
      var g = giftFor(body && body.code, body && body.name);
      return {
        state: giftState(g), giftName: g.gift_name, clientName: g.client_name, lang: g.lang,
        services: JSON.parse(g.services_json).map(function (s) { return { id: s.id, name: s.name }; }),
        minutes: g.minutes, totalCents: g.total_cents, expiresAt: g.gift_expires_at, date: g.date, start: g.start
      };
    }

    if (method === "POST" && path === "gift/schedule") {
      var gs = giftFor(body && body.code, body && body.name);
      if (giftState(gs) !== "open") throw err(409, "gift_" + giftState(gs));
      if (body.date > gs.gift_expires_at) throw err(409, "gift_date_after_expiry");
      var free = day(body.date, gs.minutes, gs.id);
      if (free.slots.indexOf(body.start) === -1) throw err(409, "slot_unavailable");
      gs.date = body.date; gs.start = body.start; gs.end = cal.toTime(cal.toMin(body.start) + gs.minutes);
      save();
      return {
        state: "scheduled", date: gs.date, start: gs.start, giftName: gs.gift_name,
        services: JSON.parse(gs.services_json).map(function (s) { return { id: s.id, name: s.name }; }),
        calendar: calendarLinks(gs)
      };
    }

    if (method === "POST" && path === "dev/mock-pay") {
      var p = find(body && body.id, body && body.t);
      if (p.status === "pending_payment") {
        if (body.result === "ok") {
          p.status = "confirmed";
          p.paid_at = nowIso();
          p.emails_sent_at = nowIso();
          if (p.mode === "gift") { p.gift_code = giftCode(); p.gift_expires_at = cal.addDays(today(), 365); }
        } else {
          p.status = "payment_failed";
        }
        save();
      }
      return { ok: true };
    }

    if (path.indexOf("admin/") === 0) return adminRoute(method, path.slice(6), query, body);

    throw err(404, "not_found");
  }

  /* ---------- Panel de la empresa (demo) ---------- */

  var ADMIN_KEY = "nyanga-demo-admin";
  function isAdmin() { try { return sessionStorage.getItem(ADMIN_KEY) === "1"; } catch (e) { return false; } }

  function all() { return Object.keys(memory).map(function (k) { return memory[k]; }); }

  function adminView(b) {
    var o = Object.assign({}, b);
    o.services = JSON.parse(b.services_json);
    delete o.services_json; delete o.token;
    o.needs_attention = b.needs_attention || 0;
    if (b.mode === "gift" && b.gift_code) o.gift_link = giftLink(b);
    return o;
  }

  function lookup(code) {
    var norm = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NYG/, "");
    var b = all().filter(function (x) { return x.gift_code === "NYG-" + norm.slice(0, 4) + "-" + norm.slice(4); })[0];
    if (!b) throw err(404, "not_found");
    var t = today();
    return {
      booking: adminView(b), scheduled: !!b.date, validToday: b.date === t,
      expired: b.date ? b.date < t : (b.gift_expires_at && b.gift_expires_at < t), redeemed: !!b.gift_redeemed_at
    };
  }

  function toEuros(v) { return Number(String(v == null ? "" : v).replace(",", ".")); }

  function adminRoute(method, path, query, body) {
    var m;
    body = body || {};
    if (method === "POST" && path === "login") {
      if (String(body.password || "").trim().toLowerCase() !== "demo") throw err(401, "wrong_password");
      try { sessionStorage.setItem(ADMIN_KEY, "1"); } catch (e) { /* privado */ }
      return { ok: true };
    }
    if (method === "POST" && path === "logout") { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* */ } return { ok: true }; }
    if (method === "GET" && path === "session") return { authenticated: isAdmin(), paymentsMode: "sumup", mailMode: "smtp" };
    if (!isAdmin()) throw err(401, "unauthorized");

    if (method === "GET" && path === "bookings") {
      var f = query.get("from") || today(), to = query.get("to") || cal.addDays(f, 60), st = query.get("status");
      return all().filter(function (b) {
        if (!b.date || b.date < f || b.date > to) return false;
        if (st === "active") return b.status === "confirmed" || b.status === "pending_payment";
        if (st) return b.status === st;
        return b.status !== "expired" && b.status !== "payment_failed";
      }).sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }).map(adminView);
    }
    if (method === "GET" && (m = path.match(/^bookings\/([^/]+)$/))) {
      if (!memory[m[1]]) throw err(404, "not_found");
      return adminView(memory[m[1]]);
    }
    if (method === "POST" && (m = path.match(/^bookings\/([^/]+)\/action$/))) {
      var b = memory[m[1]];
      if (!b) throw err(404, "not_found");
      var a = body.action, n = nowIso();
      if (a === "complete") { if (["confirmed", "no_show"].indexOf(b.status) < 0) throw err(409, "invalid_transition"); b.status = "completed"; b.balance_paid_at = n; }
      else if (a === "no_show") { if (b.status !== "confirmed") throw err(409, "invalid_transition"); b.status = "no_show"; }
      else if (a === "cancel") { if (["confirmed", "pending_payment"].indexOf(b.status) < 0) throw err(409, "invalid_transition"); b.status = "cancelled"; }
      else if (a === "reopen") { if (["completed", "no_show", "cancelled"].indexOf(b.status) < 0 || !b.paid_at) throw err(409, "invalid_transition"); b.status = "confirmed"; b.balance_paid_at = null; }
      else if (a === "resolve") { b.needs_attention = 0; }
      else if (a === "note") { b.admin_note = clean(body.note, 1000) || null; }
      else if (a === "resend") { if (["confirmed", "completed"].indexOf(b.status) < 0) throw err(409, "invalid_transition"); b.emails_sent_at = n; }
      else if (a === "refund") {
        if (["confirmed", "cancelled", "no_show"].indexOf(b.status) < 0 || !b.paid_at) throw err(409, "invalid_transition");
        var cents = body.amount === "" || body.amount == null ? b.deposit_cents : Math.round(toEuros(body.amount) * 100);
        if (!(cents > 0) || cents > b.deposit_cents) throw err(400, "invalid_amount");
        b.status = "refunded"; b.refunded_cents = cents; b.refunded_at = n;
        b.admin_note = ((b.admin_note ? b.admin_note + "\n" : "") + "Remboursé " + (cents / 100).toFixed(2).replace(".", ",") + " € le " + n.slice(0, 10) + (body.note ? " · " + clean(body.note, 300) : "")).slice(0, 1000);
      }
      else if (a === "unschedule") { if (b.mode !== "gift" || b.status !== "confirmed" || !b.date) throw err(409, "invalid_transition"); b.date = b.start = b.end = null; }
      else throw err(400, "invalid_action");
      save();
      return adminView(b);
    }
    if (method === "GET" && path === "calendar") {
      var ym = query.get("month") || "";
      if (!/^\d{4}-\d{2}$/.test(ym)) throw err(400, "invalid_month");
      var dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(), days = [];
      for (var d = 1; d <= dim; d++) {
        var key = ym + "-" + String(d).padStart(2, "0");
        days.push({
          date: key, holiday: cal.holidayName(key),
          closed: (settings().openingHours[cal.weekday(key)] || []).length === 0,
          blocks: state.blocks.filter(function (x) { return x.date === key; }),
          bookings: all().filter(function (x) { return x.date === key && ["confirmed", "pending_payment", "completed", "no_show"].indexOf(x.status) >= 0; }).length
        });
      }
      return { month: ym, today: today(), days: days };
    }
    if (method === "GET" && path === "blocks") return state.blocks;
    if (method === "POST" && path === "blocks") {
      if (!cal.isDate(body.date)) throw err(400, "invalid_date");
      var whole = !body.start && !body.end;
      if (!whole && (!cal.isTime(body.start) || !cal.isTime(body.end) || body.start >= body.end)) throw err(400, "invalid_time");
      var blk = { id: state.nextBlock++, date: body.date, start: whole ? null : body.start, end: whole ? null : body.end, reason: clean(body.reason, 200) || null };
      state.blocks.push(blk); saveState();
      var affected = all().filter(function (x) {
        return x.date === blk.date && (x.status === "confirmed" || x.status === "pending_payment") &&
          (whole || (x.start < blk.end && x.end > blk.start));
      }).map(adminView);
      return { id: blk.id, affected: affected, _status: 201 };
    }
    if (method === "DELETE" && (m = path.match(/^blocks\/(\d+)$/))) {
      state.blocks = state.blocks.filter(function (x) { return x.id !== Number(m[1]); }); saveState();
      return { ok: true };
    }
    if (method === "GET" && path === "gifts/pending") {
      return all().filter(function (x) { return x.mode === "gift" && x.status === "confirmed" && !x.date; }).map(adminView);
    }
    if (method === "GET" && (m = path.match(/^gift\/([^/]+)$/))) return lookup(decodeURIComponent(m[1]));
    if (method === "POST" && (m = path.match(/^gift\/([^/]+)\/redeem$/))) {
      var info = lookup(decodeURIComponent(m[1])), gb = memory[info.booking.id];
      if (info.redeemed) throw err(409, "already_redeemed");
      if (["confirmed", "no_show"].indexOf(gb.status) < 0) throw err(409, "not_valid");
      if (!info.validToday && !body.force) throw err(409, "wrong_date", { date: gb.date });
      gb.gift_redeemed_at = nowIso(); save();
      return lookup(gb.gift_code);
    }
    if (method === "GET" && path === "settings") return settings();
    if (method === "PUT" && path === "settings") {
      var next = Object.assign({}, settings());
      if (body.openingHours) {
        var h = {};
        for (var dd = 0; dd <= 6; dd++) {
          var list = body.openingHours[dd] || [];
          list.forEach(function (r) { if (!cal.isTime(r[0]) || !cal.isTime(r[1]) || r[0] >= r[1]) throw err(400, "invalid_hours"); });
          h[dd] = list;
        }
        next.openingHours = h;
      }
      if (body.slotStep) next.slotStep = Number(body.slotStep);
      if (body.bufferMinutes !== undefined) next.bufferMinutes = Number(body.bufferMinutes);
      state.settings = next; saveState();
      return next;
    }
    if (method === "GET" && path === "services") return { categories: CATALOG_DATA.categories, services: sortServices(adminServices()) };
    if ((method === "POST" && path === "services") || (method === "PUT" && (m = path.match(/^services\/([a-z0-9-]+)$/)))) {
      var fields = [];
      if (CATALOG_DATA.categories.map(function (c) { return c.id; }).indexOf(body.cat) < 0) fields.push("cat");
      if (clean(body.name_fr, 80).length < 2) fields.push("name_fr");
      var price = toEuros(body.price);
      if (body.price === "" || isNaN(price) || price < 0) fields.push("price");
      var dur = body.duration === "" || body.duration == null ? null : Number(body.duration);
      var slot = body.slot_minutes === "" || body.slot_minutes == null ? dur : Number(body.slot_minutes);
      if (!(slot >= 15)) fields.push("slot_minutes");
      if (fields.length) throw err(400, "invalid_fields", { fields: fields });
      var list2 = adminServices().slice();
      var sv = {
        cat: body.cat, price: price, price_from: !!body.price_from, duration: dur, slot_minutes: slot,
        name_fr: clean(body.name_fr, 80), name_en: clean(body.name_en, 80), sub_fr: clean(body.sub_fr, 80), sub_en: clean(body.sub_en, 80),
        desc_fr: String(body.desc_fr || "").slice(0, 1500), desc_en: String(body.desc_en || "").slice(0, 1500), active: body.active !== false
      };
      if (m) {
        var i = list2.map(function (x) { return x.id; }).indexOf(m[1]);
        if (i < 0) throw err(404, "not_found");
        sv.id = m[1]; sv.sort_order = list2[i].cat === sv.cat ? list2[i].sort_order : 9999;
        list2[i] = sv;
      } else {
        sv.id = plain(sv.name_fr).replace(/ /g, "-").slice(0, 32) || "soin";
        while (list2.some(function (x) { return x.id === sv.id; })) sv.id += "-2";
        sv.sort_order = 9999;
        list2.push(sv);
      }
      state.services = list2; saveState();
      return m ? sv : Object.assign({ _status: 201 }, sv);
    }
    if (method === "DELETE" && (m = path.match(/^services\/([a-z0-9-]+)$/))) {
      state.services = adminServices().filter(function (x) { return x.id !== m[1]; }); saveState();
      return { ok: true };
    }
    if (method === "POST" && path === "services/order") {
      var ids = body.ids || [], cur = adminServices();
      cur.forEach(function (x) { var k = ids.indexOf(x.id); if (k >= 0) x.sort_order = k * 10; });
      state.services = cur; saveState();
      return { categories: CATALOG_DATA.categories, services: sortServices(cur) };
    }
    throw err(404, "not_found");
  }

  /* ---------- Datos de ejemplo para el panel (solo la primera vez) ---------- */

  (function seed() {
    if (state.seeded) return;
    state.seeded = true;
    var t0 = today(), open = [], k = 1;
    while (open.length < 6 && k < 40) {
      var dk = cal.addDays(t0, k++);
      if ((settings().openingHours[cal.weekday(dk)] || []).length && !cal.holidayName(dk)) open.push(dk);
    }
    var svc = {};
    publicServices().forEach(function (s) { svc[s.id] = s; });
    function mk(o) {
      var list = o.services.map(function (id) { return svc[id]; }).filter(Boolean);
      if (!list.length) return;
      var total = list.reduce(function (n, s) { return n + Math.round(s.price * 100); }, 0);
      var mins = list.reduce(function (n, s) { return n + s.slotMinutes; }, 0);
      var b = {
        id: randomId(9), token: randomId(18), created_at: nowIso(), lang: "fr", mode: o.mode || "me",
        date: o.date || null, start: o.start || null, end: o.start ? cal.toTime(cal.toMin(o.start) + mins) : null, minutes: mins,
        services_json: JSON.stringify(list.map(function (s) { return { id: s.id, name: s.name, priceCents: Math.round(s.price * 100), minutes: s.slotMinutes }; })),
        total_cents: total, deposit_cents: o.full || o.mode === "gift" ? total : Math.round(total * 0.2), pay_full: o.full || o.mode === "gift" ? 1 : 0,
        client_name: o.client, client_email: o.client.split(" ")[0].toLowerCase() + "@exemple.fr", client_phone: "06 12 34 56 78",
        status: o.status || "confirmed", paid_at: nowIso(), emails_sent_at: nowIso(), needs_attention: 0
      };
      if (b.mode === "gift") {
        b.gift_name = o.gift; b.gift_age = 30; b.gift_email = o.gift.split(" ")[0].toLowerCase() + "@exemple.fr";
        b.gift_message = "Joyeux anniversaire !"; b.gift_code = giftCode(); b.gift_expires_at = cal.addDays(t0, 300);
      }
      memory[b.id] = b;
    }
    if (open.length) {
      mk({ date: open[0], start: open[0] && settings().openingHours[cal.weekday(open[0])][0][0], services: ["signature"], client: "Julie Bernard" });
      mk({ date: open[0], start: "14:00", services: ["headspa-voyage"], client: "Inès Moreau", full: true });
      mk({ date: open[1], start: "10:00", services: ["hammam"], client: "Claire Petit", mode: "gift", gift: "Léa Petit" });
      mk({ date: open[2], start: "17:00", services: ["relaxant", "visage"], client: "Sarah Lambert" });
      mk({ date: open[3], start: "13:30", services: ["pieds"], client: "Nadia Haddad", status: "cancelled" });
      mk({ services: ["headspa-detente"], client: "Thomas Roux", mode: "gift", gift: "Emma Roux" });
    }
    save(); saveState();
  })();

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
    if (/\/admin\//.test(location.pathname)) {
      bar.className += " admin";
      bar.innerHTML = "<strong>Panel de démonstration</strong> · mot de passe : « demo » · les données restent dans ce navigateur (aucun e-mail ni paiement réel).";
    } else {
      bar.innerHTML = "<strong>Démo</strong> · Version de présentation : aucun paiement réel, aucun e-mail envoyé.";
    }
    document.body.insertBefore(bar, document.body.firstChild);
  });
})();
