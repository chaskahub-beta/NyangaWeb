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
    return location.origin + location.pathname.replace(/[^/]*$/, "") + "?cadeau=" + encodeURIComponent(b.gift_code);
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
        services: catalog.services.filter(function (s) { return s.active !== false; }).map(function (s) {
          return { id: s.id, cat: s.cat, price: s.price, priceFrom: !!s.priceFrom, duration: s.duration, slotMinutes: s.slotMinutes, name: s.name, sub: s.sub, desc: s.desc };
        }),
        hours: CONFIG.settings.openingHours
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
          if (p.mode === "gift") { p.gift_code = giftCode(); p.gift_expires_at = cal.addDays(today(), 365); }
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
