/* ============================================================
   Nyanga Beauty & Spa — lógica de la página
   - Navegación por pestañas (estilo red social)
   - Idioma FR / EN
   - Reserva conectada al servidor:
     para quién → soins → fecha (agenda real) → datos → resumen → pago SumUp
   - Vuelta desde SumUp: /?reservation=ID&t=TOKEN muestra el resultado
   ============================================================ */

(function () {
  "use strict";

  // Abierto como archivo: las reservas necesitan el servidor.
  if (location.protocol === "file:") {
    var warn = document.createElement("div");
    warn.setAttribute("role", "alert");
    warn.style.cssText = "position:fixed;inset:0 0 auto;z-index:999;padding:12px 16px;background:#6E2A1E;color:#F6EFE6;font:14px/1.5 sans-serif;text-align:center";
    warn.innerHTML = 'Ouvrez le site depuis le serveur : <a style="color:#E3C98D" href="http://localhost:5500/">http://localhost:5500/</a>';
    document.body.appendChild(warn);
  }

  var CFG = window.NYANGA;
  var DICT = window.NYANGA_I18N;
  var CATALOG = null; // { depositRate, categories, services }

  /* ---------- Idioma ---------- */

  var lang = "fr";
  try {
    var savedLang = localStorage.getItem("nyanga-lang");
    if (savedLang === "fr" || savedLang === "en") lang = savedLang;
  } catch (e) { /* sin almacenamiento: francés por defecto */ }

  function t(k) {
    var v = DICT[lang] && DICT[lang][k];
    if (v != null) return v;
    return DICT.fr[k] != null ? DICT.fr[k] : k;
  }

  function locale() { return lang === "fr" ? "fr-FR" : "en-GB"; }

  function eur(n) {
    return new Intl.NumberFormat(locale(), {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: n % 1 ? 2 : 0,
      maximumFractionDigits: 2
    }).format(n);
  }

  function eurCents(c) { return eur(c / 100); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function L(obj) { return obj ? (obj[lang] || obj.fr) : ""; }

  function serviceById(id) {
    if (!CATALOG) return null;
    for (var i = 0; i < CATALOG.services.length; i++) if (CATALOG.services[i].id === id) return CATALOG.services[i];
    return null;
  }

  function durationText(s) { return s.duration ? s.duration + " " + t("min") : ""; }

  function parseKey(k) { var p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }

  function longDate(k) {
    return new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseKey(k));
  }

  /* ---------- API ---------- */

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || "server_error");
          err.code = data.error || "server_error";
          err.data = data;
          throw err;
        }
        return data;
      });
    }, function () {
      var err = new Error("network");
      err.code = "network";
      throw err;
    });
  }

  function errorText(code) {
    var k = "err." + code;
    var v = t(k);
    return v === k ? t("err.server_error") : v;
  }

  /* ---------- Iconos ---------- */

  var ICON = {
    me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    gift: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12"/><path d="M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    wait: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13.5v4M10 15.5h4"/></svg>'
  };

  /* ---------- Vistas (pestañas) ---------- */

  var VIEWS = ["accueil", "apropos", "soins", "contact"];

  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "accueil";
    VIEWS.forEach(function (v) {
      document.getElementById("view-" + v).hidden = v !== name;
    });
    document.querySelectorAll(".tab[data-view]").forEach(function (b) {
      if (b.dataset.view === name) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (location.hash !== "#" + name) {
      try { history.replaceState(null, "", location.pathname + location.search + "#" + name); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- Contenido dinámico ---------- */

  var filter = "all";

  function renderStories() {
    document.getElementById("stories").innerHTML = CFG.stories.map(function (s) {
      var act = s.target ? 'data-action="scroll-to" data-target="' + s.target + '"' : 'data-action="story" data-cat="' + s.cat + '"';
      return '<button class="story" ' + act + '>' +
        '<span class="story-ring"><img src="' + s.img + '" width="220" height="220" alt="" loading="lazy"></span>' +
        '<span>' + esc(L(s)) + '</span></button>';
    }).join("");
  }

  function renderFeatured() {
    var el = document.getElementById("featured");
    if (!CATALOG) { el.innerHTML = '<p class="fine">' + t("loading") + '</p>'; return; }
    el.innerHTML = CFG.featured.map(serviceById).filter(Boolean).map(function (s) {
      return '<article class="post">' +
        (CFG.photos[s.id] ? '<img class="post-img" src="' + CFG.photos[s.id] + '" width="900" height="562" alt="" loading="lazy">' : '') +
        '<div class="post-body">' +
          '<div class="post-top"><h3>' + esc(L(s.name)) + '</h3><span class="price">' + priceLabel(s) + '</span></div>' +
          '<p>' + esc(L(s.desc)) + '</p>' +
          '<div class="post-foot"><span class="meta">' + durationText(s) + '</span>' +
          '<button class="btn btn-dark" data-action="open-booking" data-service="' + s.id + '">' + t("services.book") + '</button></div>' +
        '</div></article>';
    }).join("");
  }

  function renderChips() {
    if (!CATALOG) return;
    var items = [{ id: "all", label: t("services.all") }].concat(CATALOG.categories.map(function (c) {
      return { id: c.id, label: L(c.name) };
    }));
    document.getElementById("chips").innerHTML = items.map(function (c) {
      return '<button class="chip" role="tab" data-action="filter" data-cat="' + c.id + '" aria-selected="' + (filter === c.id) + '">' + esc(c.label) + '</button>';
    }).join("");
  }

  function serviceCard(s) {
    return '<article class="service">' +
      '<div><h3>' + esc(L(s.name)) + '</h3>' + (s.sub ? '<div class="sub">' + esc(L(s.sub)) + '</div>' : '') + '</div>' +
      '<span class="price">' + priceLabel(s) + '</span>' +
      '<p>' + esc(L(s.desc)) + '</p>' +
      '<div class="service-foot"><span class="meta">' + durationText(s) + '</span>' +
      '<button class="btn btn-dark" data-action="open-booking" data-service="' + s.id + '">' + t("services.book") + '</button></div>' +
      '</article>';
  }

  function renderServices() {
    var el = document.getElementById("service-list");
    if (!CATALOG) { el.innerHTML = '<p class="fine">' + t("loading") + '</p>'; return; }
    var html = "";
    CATALOG.categories.forEach(function (c) {
      if (filter !== "all" && filter !== c.id) return;
      var list = CATALOG.services.filter(function (s) { return s.cat === c.id; });
      if (filter === "all") html += '<h2 class="service-group-title">' + esc(L(c.name)) + '</h2>';
      html += list.map(serviceCard).join("");
    });
    el.innerHTML = html;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-wa-text]").forEach(function (el) {
      el.setAttribute("href", waUrl(t(el.dataset.waText)));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.setAttribute("title", t(el.dataset.i18nTitle));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });
    document.querySelectorAll("#lang-toggle [data-lang]").forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.lang === lang);
    });
    if (CATALOG) document.getElementById("stat-count").textContent = CATALOG.services.length;
    renderStories();
    renderFeatured();
    renderChips();
    renderServices();
    renderHours();
    if (!sheet.hidden) renderBooking(true);
  }

  /* ----- Horario de Contact: viene de los Réglages del panel ----- */

  function fmtTime(hm) {
    if (lang === "en") return hm;
    var p = hm.split(":");
    return Number(p[0]) + "h" + p[1];
  }

  function renderHours() {
    var targets = [document.getElementById("contact-hours"), document.getElementById("home-hours")].filter(Boolean);
    if (!targets.length || !CATALOG || !CATALOG.hours) return;
    var names = t("days").split(",");            // dimanche … samedi
    var order = [1, 2, 3, 4, 5, 6, 0];
    var groups = [];                              // días seguidos con el mismo horario
    order.forEach(function (d) {
      var ranges = CATALOG.hours[d] || [];
      var txt = ranges.map(function (r) { return fmtTime(r[0]) + " – " + fmtTime(r[1]); }).join(" · ");
      var last = groups[groups.length - 1];
      if (last && last.txt === txt) last.days.push(d); else groups.push({ txt: txt, days: [d] });
    });
    var lines = [], closed = [];
    groups.forEach(function (g) {
      var label = names[g.days[0]] + (g.days.length > 1 ? " – " + names[g.days[g.days.length - 1]] : "");
      if (g.txt) lines.push('<span class="hours-line"><span>' + esc(cap(label)) + '</span> ' + esc(g.txt) + '</span>');
      else g.days.forEach(function (d) { closed.push(names[d]); });
    });
    var closedText = closed.length
      ? t("contact.closedDays").replace("{days}", closed.join(", "))
      : t("contact.closedHolidays");
    var html = lines.join("") + '<span class="hours-closed">' + esc(closedText) + '</span>';
    targets.forEach(function (el) { el.innerHTML = html; });
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ============================================================
     Flujo de reserva
     ============================================================ */

  // Pasos según el flujo: pour moi, carte cadeau (sin fecha) o beneficiario que usa su carte cadeau
  var FLOWS = {
    me: ["who", "services", "date", "details", "summary", "result"],
    gift: ["who", "services", "details", "summary", "result"],
    redeem: ["redeem", "date", "redeemSummary", "result"]
  };
  function steps() {
    if (B && B.flow === "redeem") return FLOWS.redeem;
    return B && B.mode === "gift" ? FLOWS.gift : FLOWS.me;
  }

  var sheet = document.getElementById("sheet");
  var backdrop = document.getElementById("sheet-backdrop");
  var sheetBody = document.getElementById("sheet-body");
  var sheetTitle = document.getElementById("sheet-title");
  var sheetTotal = document.getElementById("sheet-total");
  var btnBack = document.getElementById("sheet-back");
  var btnNext = document.getElementById("sheet-next");
  var progressBar = document.getElementById("sheet-progress-bar");
  var lastFocus = null;

  var B = null;
  var pollTimer = null;

  function newBooking(opts) {
    return {
      step: opts.mode ? 1 : 0,
      mode: opts.mode || null,
      selected: opts.service ? [opts.service] : [],
      date: null,
      slot: null,
      month: null,          // "AAAA-MM" mostrado en el calendario
      monthData: {},        // caché: "AAAA-MM|minutos" → respuesta del servidor
      dayData: null,        // horarios del día elegido
      loading: false,
      error: null,
      form: {},
      accepted: false,
      payFull: false,       // opción secundaria: pagar el total por adelantado
      flow: opts.flow || null,   // "redeem" = el beneficiario elige su día con su carte cadeau
      redeem: null,         // datos de la carte cadeau verificada
      redeemDone: null,     // respuesta tras reservar con la carte cadeau
      submitting: false,
      result: null          // { id, t, status, data }
    };
  }

  function minutes() {
    if (B.flow === "redeem") return B.redeem ? B.redeem.minutes : 0;
    return B.selected.reduce(function (sum, id) { var s = serviceById(id); return sum + (s ? s.slotMinutes : 0); }, 0);
  }

  function total() {
    return B.selected.reduce(function (sum, id) { var s = serviceById(id); return sum + (s ? s.price : 0); }, 0);
  }

  function depositCents() { return Math.round(total() * 100 * CATALOG.depositRate); }
  /** Lo que se paga ahora en SumUp: el acompte o el total */
  function payNowCents() { return (B.payFull || B.mode === "gift") ? Math.round(total() * 100) : depositCents(); }

  /** Precio con « dès » para los soins « à partir de » */
  function priceLabel(s) { return (s.priceFrom ? t("price.from") + " " : "") + eur(s.price); }

  function waUrl(text) {
    return "https://wa.me/" + CFG.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
  }
  function helpLine() {
    return '<p class="fine help-wa">' + t("help.wa") + ' <a href="' + waUrl(t("help.waText")) + '" target="_blank" rel="noopener">WhatsApp · 06 64 29 77 67</a></p>';
  }

  function openBooking(opts) {
    if (!CATALOG) return;
    lastFocus = document.activeElement;
    B = newBooking(opts || {});
    showSheet();
    renderBooking();
  }

  function showSheet() {
    sheet.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("sheet-open");
    sheetTitle.setAttribute("tabindex", "-1");
    sheetTitle.focus({ preventScroll: true });
  }

  function closeBooking() {
    clearTimeout(pollTimer);
    sheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("sheet-open");
    if (B && (B.result || B.flow === "redeem")) {
      // Quita ?reservation=… de la dirección
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* ignore */ }
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ----- Validación (el servidor vuelve a validar todo) ----- */

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim()); }
  function filled(v, min) { return (v || "").trim().length >= (min || 2); }

  function canNext() {
    var f = B.form;
    switch (steps()[B.step]) {
      case "who": return !!B.mode;
      case "services": return B.selected.length > 0;
      case "date": return !!(B.date && B.slot);
      case "details":
        var ok = filled(f.name) && validEmail(f.email) && (f.phone || "").replace(/\D/g, "").length >= 9;
        if (B.mode === "gift") {
          var age = Number(f.gAge);
          ok = ok && filled(f.gName) && validEmail(f.gEmail) && age >= 1 && age <= 120;
        }
        return ok;
      case "summary": return B.accepted && !B.submitting;
      case "redeem": return filled(f.rName) && (f.rCode || "").replace(/[^a-z0-9]/gi, "").length >= 8 && !B.submitting;
      case "redeemSummary": return !B.submitting && !!(B.date && B.slot);
      default: return true;
    }
  }

  /* ----- Agenda ----- */

  function monthKey(y, m) { return y + "-" + String(m).padStart(2, "0"); }

  function loadMonth(ym) {
    var key = ym + "|" + minutes();
    if (B.monthData[key]) return;
    B.loading = true;
    B.error = null;
    var current = B;
    api("GET", "/api/availability?month=" + ym + "&minutes=" + minutes()).then(function (data) {
      if (current !== B) return;
      B.monthData[key] = data;
      B.loading = false;
      if (steps()[B.step] === "date") renderBooking(true);
    }, function (err) {
      if (current !== B) return;
      B.loading = false;
      B.error = errorText(err.code);
      if (steps()[B.step] === "date") renderBooking(true);
    });
  }

  function loadDay(date) {
    B.dayData = null;
    B.error = null;
    var current = B;
    api("GET", "/api/availability/day?date=" + date + "&minutes=" + minutes()).then(function (data) {
      if (current !== B || B.date !== date) return;
      B.dayData = data;
      renderBooking(true);
      var slots = sheetBody.querySelector(".slots");
      if (slots) slots.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, function (err) {
      if (current !== B) return;
      B.error = errorText(err.code);
      renderBooking(true);
    });
  }

  /* ----- Pasos ----- */

  var render = {
    who: function () {
      function choice(mode, icon, title, text) {
        return '<button class="choice" data-action="mode" data-mode="' + mode + '" aria-pressed="' + (B.mode === mode) + '">' +
          '<span class="choice-icon">' + icon + '</span>' +
          '<span><strong>' + title + '</strong><span>' + text + '</span></span></button>';
      }
      return '<p class="step-intro">' + t("b.who.intro") + '</p>' +
        '<div class="choice-grid">' +
          choice("me", ICON.me, t("b.who.me"), t("b.who.meText")) +
          choice("gift", ICON.gift, t("b.who.gift"), t("b.who.giftText")) +
        '</div>' +
        '<p class="fine redeem-link"><button class="link" data-action="open-redeem">' + t("b.who.haveGift") + '</button></p>';
    },

    services: function () {
      var html = '<p class="step-intro">' + t("b.services.intro") + '</p>';
      CATALOG.categories.forEach(function (c) {
        html += '<div class="pick-group"><h3 class="service-group-title">' + esc(L(c.name)) + '</h3>';
        CATALOG.services.filter(function (s) { return s.cat === c.id; }).forEach(function (s) {
          var checked = B.selected.indexOf(s.id) !== -1;
          html += '<label class="pick">' +
            '<input type="checkbox" id="pick-' + s.id + '" data-service="' + s.id + '"' + (checked ? " checked" : "") + '>' +
            '<span class="pick-name"><b>' + esc(L(s.name)) + '</b>' + (s.duration ? '<small>' + durationText(s) + '</small>' : '') + '</span>' +
            '<span class="price">' + priceLabel(s) + '</span></label>';
        });
        html += '</div>';
      });
      return html;
    },

    date: function () {
      var html = '<p class="step-intro">' + t("b.date.intro") + '</p>';
      if (B.flow === "redeem" && B.redeem && B.redeem.expiresAt) {
        html += '<p class="notice">' + t("b.redeem.validUntil").replace("{date}", esc(longDate(B.redeem.expiresAt))) + '</p>';
      }
      if (B.error) html += '<p class="notice warm" role="alert">' + esc(B.error) + '</p>';

      if (!B.month) {
        var now = new Date();
        var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        B.month = monthKey(tomorrow.getFullYear(), tomorrow.getMonth() + 1);
      }
      var data = B.monthData[B.month + "|" + minutes()];
      if (!data) {
        loadMonth(B.month);
        return html + '<div class="cal"><p class="fine">' + t("loading") + '</p></div>';
      }

      var parts = B.month.split("-").map(Number);
      var first = new Date(parts[0], parts[1] - 1, 1);
      var monthName = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(first);
      var canPrev = B.month > data.first.slice(0, 7);
      var canNextMonth = B.month < data.last.slice(0, 7);

      var dowFmt = new Intl.DateTimeFormat(locale(), { weekday: "short" });
      var dows = "";
      for (var i = 0; i < 7; i++) {
        dows += '<span class="cal-dow">' + dowFmt.format(new Date(2024, 0, 1 + i)).replace(".", "") + '</span>';
      }

      var lead = (first.getDay() + 6) % 7;
      var cells = "";
      for (var b = 0; b < lead; b++) cells += "<span></span>";
      data.days.forEach(function (d) {
        var open = d.status === "open";
        var label = longDate(d.date) + (d.status === "full" ? " · " + t("b.date.full") : "");
        cells += '<button class="cal-day' + (d.status === "holiday" ? " is-holiday" : "") + (d.status === "full" ? " is-full" : "") +
          '" data-action="day" data-date="' + d.date + '"' + (open ? "" : " disabled") +
          ' aria-pressed="' + (B.date === d.date) + '" aria-label="' + esc(label) + '">' + Number(d.date.slice(8)) + '</button>';
      });

      html += '<div class="cal">' +
        '<div class="cal-head">' +
          '<button class="icon-btn" data-action="month" data-dir="-1" aria-label="' + t("b.date.prev") + '"' + (canPrev ? "" : " disabled") + '>' + ICON.prev + '</button>' +
          '<h3>' + esc(monthName) + '</h3>' +
          '<button class="icon-btn" data-action="month" data-dir="1" aria-label="' + t("b.date.next") + '"' + (canNextMonth ? "" : " disabled") + '>' + ICON.next + '</button>' +
        '</div>' +
        '<div class="cal-grid">' + dows + cells + '</div>' +
        '<div class="cal-legend"><span>' + t("b.date.legendClosed") + '</span><span>' + t("b.date.legendFull") + '</span></div>' +
      '</div>';

      if (B.date) {
        html += '<div class="form-section"><h3>' + t("b.date.slots") + ' · ' + esc(longDate(B.date)) + '</h3>';
        if (!B.dayData) {
          html += '<p class="fine">' + t("loading") + '</p>';
        } else if (!B.dayData.slots.length) {
          html += '<p class="fine">' + t("b.date.noSlots") + '</p>';
        } else {
          html += '<div class="slots">' + B.dayData.slots.map(function (s) {
            return '<button class="slot" data-action="slot" data-slot="' + s + '" aria-pressed="' + (B.slot === s) + '">' + s + '</button>';
          }).join("") + '</div>';
        }
        html += '</div>';
      } else {
        html += '<p class="fine">' + t("b.date.pick") + '</p>';
      }
      return html;
    },

    details: function () {
      var f = B.form;
      function field(key, label, type, attrs) {
        var id = "f-" + key;
        if (type === "textarea") {
          return '<div class="field"><label for="' + id + '">' + label + '</label>' +
            '<textarea id="' + id + '" data-field="' + key + '" ' + (attrs || "") + '>' + esc(f[key] || "") + '</textarea></div>';
        }
        return '<div class="field"><label for="' + id + '">' + label + '</label>' +
          '<input id="' + id + '" type="' + type + '" data-field="' + key + '" value="' + esc(f[key] || "") + '" ' + (attrs || "") + '></div>';
      }

      var html = '<div class="form-section">' +
        (B.mode === "gift" ? '<h3>' + t("b.details.you") + '</h3>' : '') +
        field("name", t("b.details.name"), "text", 'autocomplete="name" maxlength="100" required') +
        field("email", t("b.details.email"), "email", 'autocomplete="email" inputmode="email" maxlength="254" required') +
        field("phone", t("b.details.phone"), "tel", 'autocomplete="tel" inputmode="tel" maxlength="30" required') +
        '</div>';

      if (B.mode === "gift") {
        html += '<div class="form-section"><h3>' + t("b.details.recipient") + '</h3>' +
          '<div class="field-row">' +
            field("gName", t("b.details.name"), "text", 'autocomplete="off" maxlength="100" required') +
            field("gAge", t("b.details.age"), "number", 'min="1" max="120" inputmode="numeric" required') +
          '</div>' +
          field("gEmail", t("b.details.email"), "email", 'autocomplete="off" inputmode="email" maxlength="254" required') +
          field("gMessage", t("b.details.message"), "textarea", 'maxlength="300"') +
          '<p class="notice">' + t("b.details.giftInfo") + '</p>' +
          '</div>';
      }
      return html;
    },

    summary: function () {
      var f = B.form;
      var dep = depositCents();
      var now = payNowCents();
      var rows = "";
      rows += row(t("b.summary.for"), B.mode === "gift" ? t("b.summary.gift") + " " + esc(f.gName) : t("b.summary.me"));
      B.selected.forEach(function (id) {
        var s = serviceById(id);
        rows += row(esc(L(s.name)), priceLabel(s));
      });
      var gift = B.mode === "gift";
      if (!gift) rows += row(t("b.summary.date"), esc(longDate(B.date)) + " · " + B.slot);
      rows += row(t("b.summary.total"), eur(total()), "total");
      if (!gift) rows += row(t("b.summary.rest"), B.payFull ? t("b.summary.nothingLeft") : eurCents(total() * 100 - dep));
      rows += row(t(gift || B.payFull ? "b.summary.payFullNow" : "b.summary.deposit"), eurCents(now), "deposit");
      var fromNote = B.selected.some(function (id) { var s = serviceById(id); return s && s.priceFrom; })
        ? '<p class="fine">' + t("b.summary.fromNote") + '</p>' : '';

      // Acompte del 20 % (recomendado) o, como segunda opción, todo por adelantado
      var options = '<fieldset class="pay-options"><legend>' + t("b.summary.payHow") + '</legend>' +
        payOption("deposit", !B.payFull, t("b.summary.optDeposit").replace("{amount}", eurCents(dep)),
          t("b.summary.optDepositHint").replace("{amount}", eurCents(total() * 100 - dep))) +
        payOption("full", B.payFull, t("b.summary.optFull").replace("{amount}", eur(total())), t("b.summary.optFullHint")) +
        '</fieldset>';

      function payOption(value, checked, title, hint) {
        return '<label class="pay-option"><input type="radio" name="pay-mode" value="' + value + '" data-action="pay-mode"' + (checked ? " checked" : "") + '>' +
          '<span><strong>' + title + '</strong><small>' + hint + '</small></span></label>';
      }

      function row(a, b, cls) {
        return '<div class="summary-row' + (cls ? " " + cls : "") + '"><span>' + a + '</span><span>' + b + '</span></div>';
      }

      if (gift) options = '<p class="notice">' + t("b.summary.giftFull").replace("{name}", esc(f.gName)) + '</p>';

      return (B.error ? '<p class="notice warm" role="alert">' + esc(B.error) + '</p>' : '') +
        '<div class="summary">' + rows + '</div>' + fromNote + options +
        '<label class="check"><input type="checkbox" id="accept-terms" data-action="accept"' + (B.accepted ? " checked" : "") + '>' +
        '<span>' + t("b.summary.terms") + '</span></label>' +
        (B.mode === "gift" ? '<p class="notice warm">' + t("b.summary.giftTerms") + '</p>' : '') +
        '<p class="fine">' + t(gift ? "b.summary.redirectGift" : "b.summary.redirect") + '</p>';
    },

    redeem: function () {
      var f = B.form;
      var html = '<p class="step-intro">' + t("b.redeem.intro") + '</p>';
      if (B.error) html += '<p class="notice warm" role="alert">' + esc(B.error) + '</p>';
      if (B.redeem && B.redeem.state !== "open") html += '<p class="notice warm" role="alert">' + giftStateText(B.redeem) + '</p>';
      html += '<div class="form-section">' +
        '<div class="field"><label for="f-rName">' + t("b.redeem.name") + '</label>' +
          '<input id="f-rName" type="text" data-field="rName" value="' + esc(f.rName || "") + '" autocomplete="given-name" maxlength="100" required></div>' +
        '<div class="field"><label for="f-rCode">' + t("b.redeem.code") + '</label>' +
          '<input id="f-rCode" type="text" data-field="rCode" value="' + esc(f.rCode || "") + '" placeholder="NYG-XXXX-XXXX" autocomplete="off" autocapitalize="characters" maxlength="20" required></div>' +
        '</div>';
      return html + helpLine();
    },

    redeemSummary: function () {
      var g = B.redeem;
      var rows = '<div class="summary-row"><span>' + t("b.summary.for") + '</span><span>' + esc(g.giftName) + '</span></div>' +
        g.services.map(function (s) { return '<div class="summary-row"><span>' + esc(L(s.name)) + '</span><span>✓</span></div>'; }).join("") +
        '<div class="summary-row"><span>' + t("b.summary.date") + '</span><span>' + esc(longDate(B.date)) + ' · ' + B.slot + '</span></div>' +
        '<div class="summary-row"><span>' + t("b.redeem.offeredBy") + '</span><span>' + esc(g.clientName) + '</span></div>' +
        '<div class="summary-row total"><span>' + t("b.redeem.paid") + '</span><span>✓</span></div>';
      return (B.error ? '<p class="notice warm" role="alert">' + esc(B.error) + '</p>' : '') +
        '<div class="summary">' + rows + '</div>' +
        '<p class="fine">' + t("b.redeem.emailNote") + '</p>' + helpLine();
    },

    result: function () {
      var r = B.result;
      if (!r || !r.data) {
        return '<div class="done"><div class="done-mark">' + ICON.wait + '</div><p>' + t("b.result.checking") + '</p></div>';
      }
      var d = r.data;
      if (B.flow === "redeem") return redeemDoneHtml(d);

      if (d.status === "confirmed" || d.status === "completed") {
        var html = '<div class="done">' +
          '<div class="done-mark">' + ICON.check + '</div>' +
          '<p>' + t(d.mode === "gift" ? "b.done.textGift" : d.paidFull ? "b.done.textFull" : "b.done.text") + '</p>' +
          resultSummary(d);
        if (d.mode === "gift" && d.giftCode) {
          html += '<div class="gift-card">' +
            '<span class="eyebrow">' + t("b.done.giftEyebrow") + '</span>' +
            '<span class="gift-code">' + esc(d.giftCode) + '</span>' +
            '<span>' + t("b.done.giftFor") + ' ' + esc(d.giftName) + '</span>' +
            (d.giftExpiresAt ? '<small>' + t("b.done.validUntil") + ' ' + esc(longDate(d.giftExpiresAt)) + '</small>' : '') +
            '<small>' + t("b.done.giftSent") + '</small>' +
            '</div>' +
            '<p class="fine">' + t("b.summary.giftTerms") + '</p>' +
            shareBlock(d);
        }
        if (d.calendar) {
          html += '<div class="add-cal">' +
            '<span class="eyebrow">' + t(d.mode === "gift" ? "b.done.calendarGift" : "b.done.calendar") + '</span>' +
            '<div class="add-cal-btns">' +
            '<a class="btn btn-outline" href="' + esc(d.calendar.ics) + '">' + ICON.calendar + t("b.done.calendarApple") + '</a>' +
            '<a class="btn btn-outline" href="' + esc(d.calendar.google) + '" target="_blank" rel="noopener">' + ICON.calendar + t("b.done.calendarGoogle") + '</a>' +
            '</div>' +
            '<small>' + t("b.done.calendarHint") + '</small>' +
            '</div>';
        }
        return html + helpLine() + '</div>';
      }

      if (d.status === "pending_payment") {
        return '<div class="done"><div class="done-mark">' + ICON.wait + '</div>' +
          '<p>' + t("b.result.pending") + '</p>' + resultSummary(d) +
          '<button class="btn btn-outline" data-action="retry">' + t("b.result.resume") + '</button></div>';
      }

      if (d.status === "payment_failed" || d.status === "expired") {
        return '<div class="done"><div class="done-mark is-alert">' + ICON.alert + '</div>' +
          '<p>' + t(d.status === "expired" ? "b.result.expired" : "b.result.failed") + '</p>' +
          (B.error ? '<p class="notice warm" role="alert">' + esc(B.error) + '</p>' : '') +
          resultSummary(d) +
          '<button class="btn btn-dark" data-action="retry">' + t("b.result.retry") + '</button></div>';
      }

      return '<div class="done"><div class="done-mark is-alert">' + ICON.alert + '</div><p>' + t("b.result.cancelled") + '</p></div>';
    }
  };

  function resultSummary(d) {
    return '<div class="summary">' +
      (d.date ? '<div class="summary-row"><span>' + t("b.summary.date") + '</span><span>' + esc(longDate(d.date)) + ' · ' + esc(d.start) + '</span></div>' : '') +
      d.services.map(function (s) {
        return '<div class="summary-row"><span>' + esc(L(s.name)) + '</span><span>' + eurCents(s.priceCents) + '</span></div>';
      }).join("") +
      '<div class="summary-row total"><span>' + t("b.summary.total") + '</span><span>' + eurCents(d.totalCents) + '</span></div>' +
      '<div class="summary-row"><span>' + t(paidLabel(d)) + '</span><span>' + eurCents(d.depositCents) + '</span></div>' +
      (d.mode === "gift" ? '' : '<div class="summary-row"><span>' + t("b.summary.rest") + '</span><span>' + (d.restCents > 0 ? eurCents(d.restCents) : t("b.summary.nothingLeft")) + '</span></div>') +
      '</div>';
  }

  function paidLabel(d) {
    var paid = d.status === "confirmed" || d.status === "completed";
    if (d.paidFull) return paid ? "b.summary.paidFull" : "b.summary.payFullNow";
    return paid ? "b.summary.depositPaid" : "b.summary.deposit";
  }

  /* ----- Mensaje listo para enviar al beneficiario de la carte cadeau ----- */

  function shareText(d) {
    var names = d.services.map(function (s) { return L(s.name); }).join(" + ");
    var lines = [
      t("b.share.hello").replace("{name}", d.giftName),
      t("b.share.offer").replace("{services}", names),
      t("b.share.link").replace("{link}", d.giftLink || ""),
      t("b.share.code").replace("{code}", d.giftCode) + (d.giftExpiresAt ? " " + t("b.share.until").replace("{date}", longDate(d.giftExpiresAt)) : ""),
      t("b.share.paid")
    ];
    if (d.giftMessage) lines.push("« " + d.giftMessage + " »");
    if (d.clientName) lines.push("— " + d.clientName);
    return lines.join("\n");
  }

  function shareBlock(d) {
    var text = shareText(d);
    var enc = encodeURIComponent(text);
    var subject = encodeURIComponent(t("b.share.subject"));
    return '<div class="share-gift">' +
      '<span class="eyebrow">' + esc(t("b.share.title").replace("{name}", d.giftName)) + '</span>' +
      '<p class="fine">' + t("b.share.intro") + '</p>' +
      '<p class="share-text" id="share-text">' + esc(text) + '</p>' +
      '<div class="share-btns">' +
        (navigator.share ? '<button class="btn btn-dark" data-action="share-native">' + ICON.share + t("b.share.native") + '</button>' : '') +
        '<a class="btn btn-outline" href="https://wa.me/?text=' + enc + '" target="_blank" rel="noopener">WhatsApp</a>' +
        '<a class="btn btn-outline" href="sms:?&body=' + enc + '">' + t("b.share.sms") + '</a>' +
        '<a class="btn btn-outline" href="mailto:?subject=' + subject + '&body=' + enc + '">' + t("b.share.email") + '</a>' +
        '<button class="btn btn-outline" data-action="share-copy">' + t("b.share.copy") + '</button>' +
      '</div>' +
      '<small class="share-status" id="share-status" role="status" aria-live="polite"></small>' +
    '</div>';
  }

  function updateFooter() {
    var step = steps()[B.step];
    btnBack.hidden = B.step === 0 || step === "result";
    if (step === "summary") btnNext.textContent = B.submitting ? t("b.redirecting") : t(B.mode === "gift" ? "b.payGift" : B.payFull ? "b.payFull" : "b.pay");
    else if (step === "redeemSummary") btnNext.textContent = B.submitting ? t("loading") : t("b.redeem.confirm");
    else if (step === "result") btnNext.textContent = t("b.finish");
    else btnNext.textContent = t("b.next");
    btnNext.disabled = !canNext();

    if (B.selected.length && step !== "who" && step !== "result") {
      sheetTotal.innerHTML = '<span>' + t("b.total") + ' · ' + B.selected.length + '</span><strong>' + eur(total()) + '</strong>';
    } else {
      sheetTotal.innerHTML = "";
    }
  }

  function renderBooking(keepScroll) {
    var step = steps()[B.step];
    var scroll = sheetBody.scrollTop;
    var titleKey = step === "result" ? resultTitle() : "b." + step + ".title";
    sheetTitle.textContent = t(titleKey);
    progressBar.style.width = Math.max(6, (B.step / (steps().length - 1)) * 100) + "%";
    sheetBody.innerHTML = render[step]();
    sheetBody.scrollTop = keepScroll ? scroll : 0;
    updateFooter();
  }

  function resultTitle() {
    if (B.flow === "redeem") return "b.redeem.doneTitle";
    var d = B.result && B.result.data;
    if (!d) return "b.result.title";
    if (d.status === "confirmed" || d.status === "completed") return "b.done.title";
    if (d.status === "pending_payment") return "b.result.pendingTitle";
    return "b.result.problemTitle";
  }

  /* ----- Envío y pago ----- */

  function submitBooking() {
    var f = B.form;
    var body = {
      lang: lang,
      mode: B.mode,
      services: B.selected.slice(),
      date: B.mode === "gift" ? null : B.date,
      start: B.mode === "gift" ? null : B.slot,
      client: { name: f.name, email: f.email, phone: f.phone },
      acceptDeposit: B.accepted,
      payFull: B.mode === "gift" || B.payFull
    };
    if (B.mode === "gift") body.gift = { name: f.gName, age: Number(f.gAge), email: f.gEmail, message: f.gMessage || "" };

    B.submitting = true;
    B.error = null;
    updateFooter();

    api("POST", "/api/bookings", body).then(function (res) {
      try { sessionStorage.setItem("nyanga-last-booking", JSON.stringify({ id: res.id, t: res.token })); } catch (e) { /* ignore */ }
      window.location.href = res.paymentUrl;
    }, function (err) {
      B.submitting = false;
      if (err.code === "slot_unavailable") {
        // El horario se ocupó mientras tanto: volver a la agenda
        B.slot = null;
        B.monthData = {};
        B.dayData = null;
        B.step = steps().indexOf("date");
        B.error = errorText(err.code);
        loadDay(B.date);
      } else {
        B.error = errorText(err.code);
      }
      renderBooking();
    });
  }

  function goNext() {
    if (!canNext()) return;
    var step = steps()[B.step];
    if (step === "result") { closeBooking(); return; }
    if (step === "summary") { submitBooking(); return; }
    if (step === "redeem") { verifyGift(); return; }
    if (step === "redeemSummary") { scheduleGift(); return; }
    B.error = null;
    B.step++;
    renderBooking();
  }

  function goBack() {
    if (B.step > 0) { B.error = null; B.step--; renderBooking(); }
  }

  /* ----- Carte cadeau: el beneficiario elige su día ----- */

  function openRedeem(code) {
    lastFocus = document.activeElement;
    B = newBooking({ flow: "redeem" });
    B.form.rCode = code || "";
    showSheet();
    renderBooking();
  }

  function giftStateText(g) {
    if (g.state === "scheduled") return t("b.redeem.scheduled").replace("{date}", esc(longDate(g.date))).replace("{time}", esc(g.start));
    if (g.state === "expired") return t("b.redeem.expired").replace("{date}", esc(longDate(g.expiresAt)));
    return t("b.redeem." + g.state);
  }

  function verifyGift() {
    var f = B.form;
    B.submitting = true;
    B.error = null;
    updateFooter();
    var current = B;
    api("POST", "/api/gift/verify", { code: f.rCode, name: f.rName }).then(function (g) {
      if (current !== B) return;
      B.submitting = false;
      B.redeem = g;
      if (g.state === "open") { B.step = steps().indexOf("date"); B.month = null; B.monthData = {}; }
      renderBooking();
    }, function (err) {
      if (current !== B) return;
      B.submitting = false;
      B.error = errorText(err.code);
      renderBooking(true);
    });
  }

  function scheduleGift() {
    var f = B.form;
    B.submitting = true;
    B.error = null;
    updateFooter();
    var current = B;
    api("POST", "/api/gift/schedule", { code: f.rCode, name: f.rName, date: B.date, start: B.slot }).then(function (res) {
      if (current !== B) return;
      B.submitting = false;
      B.redeemDone = res;
      B.result = { data: res };
      B.step = steps().indexOf("result");
      renderBooking();
    }, function (err) {
      if (current !== B) return;
      B.submitting = false;
      B.error = errorText(err.code);
      if (err.code === "slot_unavailable") {
        B.slot = null; B.monthData = {}; B.dayData = null;
        B.step = steps().indexOf("date");
        loadDay(B.date);
      }
      renderBooking();
    });
  }

  function redeemDoneHtml(d) {
    var html = '<div class="done"><div class="done-mark">' + ICON.check + '</div>' +
      '<p>' + t("b.redeem.doneText") + '</p>' +
      '<div class="summary">' +
        '<div class="summary-row"><span>' + t("b.summary.date") + '</span><span>' + esc(longDate(d.date)) + ' · ' + esc(d.start) + '</span></div>' +
        d.services.map(function (s) { return '<div class="summary-row"><span>' + esc(L(s.name)) + '</span><span>✓</span></div>'; }).join("") +
      '</div>';
    if (d.calendar) {
      html += '<div class="add-cal"><span class="eyebrow">' + t("b.done.calendar") + '</span><div class="add-cal-btns">' +
        '<a class="btn btn-outline" href="' + esc(d.calendar.ics) + '">' + ICON.calendar + t("b.done.calendarApple") + '</a>' +
        '<a class="btn btn-outline" href="' + esc(d.calendar.google) + '" target="_blank" rel="noopener">' + ICON.calendar + t("b.done.calendarGoogle") + '</a>' +
        '</div><small>' + t("b.done.calendarHint") + '</small></div>';
    }
    return html + helpLine() + '</div>';
  }

  /* ----- Vuelta desde el pago ----- */

  function checkResult(attempt) {
    var current = B;
    api("GET", "/api/bookings/" + encodeURIComponent(B.result.id) + "?t=" + encodeURIComponent(B.result.t)).then(function (data) {
      if (current !== B) return;
      B.result.data = data;
      B.mode = data.mode;
      B.step = steps().indexOf("result");   // la carte cadeau tiene un paso menos
      renderBooking(true);
      // El aviso de SumUp puede tardar unos segundos
      if (data.status === "pending_payment" && attempt < 10) {
        pollTimer = setTimeout(function () { checkResult(attempt + 1); }, 3000);
      }
    }, function (err) {
      if (current !== B) return;
      B.result.data = { status: "cancelled" };
      B.error = errorText(err.code);
      renderBooking(true);
    });
  }

  function openResult(id, token) {
    lastFocus = document.activeElement;
    B = newBooking({});
    B.step = steps().indexOf("result");
    B.result = { id: id, t: token, data: null };
    showSheet();
    renderBooking();
    checkResult(0);
  }

  function retryPayment() {
    var r = B.result;
    B.error = null;
    api("POST", "/api/bookings/" + encodeURIComponent(r.id) + "/pay", { t: r.t }).then(function (res) {
      if (res.paymentUrl) window.location.href = res.paymentUrl;
      else checkResult(0);
    }, function (err) {
      B.error = errorText(err.code);
      renderBooking(true);
    });
  }

  /* ----- Eventos de la hoja ----- */

  sheetBody.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el || !sheetBody.contains(el)) return;
    var a = el.dataset.action;

    if (a === "mode") {
      B.mode = el.dataset.mode;
      B.step = 1;
      renderBooking();
    } else if (a === "month") {
      var p = B.month.split("-").map(Number);
      var d = new Date(p[0], p[1] - 1 + Number(el.dataset.dir), 1);
      B.month = monthKey(d.getFullYear(), d.getMonth() + 1);
      renderBooking(true);
    } else if (a === "day") {
      if (B.date !== el.dataset.date) {
        B.date = el.dataset.date;
        B.slot = null;
        loadDay(B.date);
      }
      renderBooking(true);
    } else if (a === "slot") {
      B.slot = el.dataset.slot;
      B.error = null;
      renderBooking(true);
    } else if (a === "open-redeem") {
      openRedeem("");
    } else if (a === "retry") {
      retryPayment();
    } else if (a === "share-copy" || a === "share-native") {
      var text = shareText(B.result.data);
      var status = document.getElementById("share-status");
      if (a === "share-native" && navigator.share) {
        navigator.share({ title: t("b.share.subject"), text: text }).catch(function () { /* cancelado */ });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          if (status) status.textContent = t("b.share.copied");
        }, function () { selectShareText(); });
      } else {
        selectShareText();
      }
    }
  });

  sheetBody.addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.service) {
      var id = el.dataset.service;
      var i = B.selected.indexOf(id);
      if (el.checked && i === -1) B.selected.push(id);
      if (!el.checked && i !== -1) B.selected.splice(i, 1);
      // La duración cambia: hay que volver a elegir fecha y hora
      B.date = null;
      B.slot = null;
      B.dayData = null;
      updateFooter();
    } else if (el.dataset.action === "accept") {
      B.accepted = el.checked;
      updateFooter();
    } else if (el.dataset.action === "pay-mode") {
      B.payFull = el.value === "full";
      renderBooking(true);
    }
  });

  sheetBody.addEventListener("input", function (e) {
    var el = e.target;
    if (el.dataset.field) {
      B.form[el.dataset.field] = el.value;
      updateFooter();
    }
  });

  btnNext.addEventListener("click", goNext);
  btnBack.addEventListener("click", goBack);
  backdrop.addEventListener("click", closeBooking);
  sheet.querySelector('[data-action="close-booking"]').addEventListener("click", closeBooking);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !sheet.hidden) closeBooking();
  });

  function selectShareText() {
    var p = document.getElementById("share-text");
    if (!p) return;
    var range = document.createRange();
    range.selectNodeContents(p);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---------- Eventos generales ---------- */

  document.addEventListener("click", function (e) {
    if (sheet.contains(e.target)) return;

    var tab = e.target.closest("[data-view]");
    if (tab) { showView(tab.dataset.view); return; }

    var link = e.target.closest("[data-view-link]");
    if (link) { showView(link.dataset.viewLink); return; }

    var el = e.target.closest("[data-action]");
    if (!el) return;
    var a = el.dataset.action;

    if (a === "open-booking") {
      openBooking({ mode: el.dataset.mode, service: el.dataset.service });
    } else if (a === "open-redeem") {
      openRedeem("");
    } else if (a === "scroll-to") {
      showView("accueil");
      var target = document.getElementById(el.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (a === "story" || a === "filter") {
      filter = el.dataset.cat;
      renderChips();
      renderServices();
      if (a === "story") showView("soins");
    }
  });

  document.getElementById("lang-toggle").addEventListener("click", function () {
    lang = lang === "fr" ? "en" : "fr";
    try { localStorage.setItem("nyanga-lang", lang); } catch (e) { /* sin almacenamiento */ }
    applyI18n();
  });

  window.addEventListener("hashchange", function () {
    if (!sheet.hidden) closeBooking();
    showView(location.hash.slice(1));
  });

  /* ---------- Inicio ---------- */

  applyI18n();
  showView(location.hash.slice(1) || "accueil");

  api("GET", "/api/catalog").then(function (data) {
    CATALOG = data;
    applyI18n();
  }, function () {
    document.getElementById("featured").innerHTML = '<p class="fine">' + t("err.catalog") + '</p>';
    document.getElementById("service-list").innerHTML = '<p class="fine">' + t("err.catalog") + '</p>';
  }).then(function () {
    var params = new URLSearchParams(location.search);
    var id = params.get("reservation");
    var token = params.get("t");
    var giftCode = params.get("cadeau");
    if (id && token && CATALOG) openResult(id, token);
    else if (giftCode !== null && CATALOG) openRedeem(giftCode);
  });
})();
