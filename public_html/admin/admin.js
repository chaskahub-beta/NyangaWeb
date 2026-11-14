/* Panel de la empresa: agenda, calendrier, cartes cadeau, réglages */
(function () {
  "use strict";

  // Abierto como archivo (doble clic en index.html): sin servidor no hay API.
  if (location.protocol === "file:") {
    document.body.innerHTML = '<div style="max-width:520px;margin:15vh auto;padding:24px;font-family:sans-serif;line-height:1.6">' +
      '<h1 style="font-weight:400">Ouvrez le panel depuis le serveur</h1>' +
      '<p>Ce fichier ne fonctionne pas ouvert directement. Lancez le serveur puis ouvrez ' +
      '<a href="http://localhost:5500/admin/">http://localhost:5500/admin/</a>.</p></div>';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };

  var STATUS = {
    pending_payment: "Paiement en cours",
    confirmed: "Confirmé",
    completed: "Terminé",
    cancelled: "Annulé",
    no_show: "Absente",
    payment_failed: "Paiement refusé",
    expired: "Expiré"
  };

  var DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  var ERRORS = {
    wrong_password: "Mot de passe incorrect.",
    too_many_attempts: "Trop de tentatives. Réessayez dans 15 minutes.",
    admin_disabled: "Le panel est désactivé : définissez ADMIN_PASSWORD sur le serveur.",
    invalid_transition: "Cette action n'est pas possible pour ce rendez-vous.",
    already_redeemed: "Ce code a déjà été utilisé.",
    not_valid: "Ce code n'est pas valable (réservation annulée ou non payée).",
    not_found: "Introuvable.",
    invalid_hours: "Horaires invalides : l'heure de fin doit être après l'heure de début, sans chevauchement.",
    invalid_time: "Heures invalides.",
    mail_failed: "L'envoi des e-mails a échoué.",
    network: "Connexion impossible."
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function eur(cents) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function key(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(k) { var p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(k, n) { var d = parse(k); d.setDate(d.getDate() + n); return key(d); }
  function longDate(k) {
    return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parse(k));
  }
  function dateTime(iso) {
    return iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—";
  }
  function errText(e) { return ERRORS[e.code] || "Une erreur est survenue (" + e.code + ")."; }

  function api(method, url, body) {
    return fetch("/api/admin" + url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && url !== "/login") { showLogin(); }
        if (!res.ok) { var e = new Error(data.error); e.code = data.error || "server_error"; e.data = data; throw e; }
        return data;
      });
    }, function () { var e = new Error("network"); e.code = "network"; throw e; });
  }

  /* ---------- Session ---------- */

  function showLogin() {
    $("app").hidden = true;
    $("login").hidden = false;
    $("password").focus();
  }

  function showApp(session) {
    $("login").hidden = true;
    $("app").hidden = false;
    var modes = [];
    if (session.paymentsMode !== "sumup") modes.push("Paiements simulés : SumUp n'est pas encore configuré");
    if (session.mailMode !== "smtp") modes.push("E-mails non envoyés : enregistrés dans data/outbox");
    $("modes").innerHTML = modes.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("");
    loadAgenda();
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    $("login-error").textContent = "";
    api("POST", "/login", { password: $("password").value }).then(function () {
      $("password").value = "";
      return api("GET", "/session");
    }).then(showApp, function (err) { $("login-error").textContent = errText(err); });
  });

  $("logout").addEventListener("click", function () {
    api("POST", "/logout").then(showLogin, showLogin);
  });

  /* ---------- Onglets ---------- */

  var loaded = {};
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(function (t) {
        if (t === tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
      });
      document.querySelectorAll(".panel").forEach(function (p) { p.hidden = p.id !== "tab-" + name; });
      if (name === "agenda") loadAgenda();
      if (name === "calendrier") loadCalendar();
      if (name === "reglages" && !loaded.settings) loadSettings();
    });
  });

  /* ---------- Agenda ---------- */

  function pills(b) {
    var out = '<span class="pill ' + b.status + '">' + STATUS[b.status] + "</span>";
    if (b.mode === "gift") out += '<span class="pill gift">Carte cadeau</span>';
    if (b.needs_attention) out += '<span class="pill attention">À vérifier</span>';
    return out;
  }

  function itemHtml(b) {
    return '<button class="item" data-booking="' + esc(b.id) + '">' +
      '<span class="item-time">' + esc(b.start) + '<small>' + esc(b.end) + '</small></span>' +
      '<span class="item-main"><b>' + esc(b.mode === "gift" ? b.gift_name + " (offert par " + b.client_name + ")" : b.client_name) + '</b>' +
      '<small>' + esc(b.services.map(function (s) { return s.name.fr; }).join(" + ")) + '</small></span>' +
      '<span class="pills">' + pills(b) + '</span></button>';
  }

  function renderList(el, list) {
    if (!list.length) { el.innerHTML = '<p class="empty">Aucun rendez-vous.</p>'; return; }
    var groups = {};
    list.forEach(function (b) { (groups[b.date] = groups[b.date] || []).push(b); });
    el.innerHTML = Object.keys(groups).sort().map(function (d) {
      return '<div class="agenda-day"><h3>' + esc(longDate(d)) + '</h3><div class="agenda-items">' +
        groups[d].map(itemHtml).join("") + "</div></div>";
    }).join("");
  }

  function loadAgenda() {
    var today = key(new Date());
    var f = $("agenda-filter").value;
    var q = "";
    if (f === "upcoming") q = "?from=" + today + "&to=" + addDays(today, 120);
    if (f === "today") q = "?from=" + today + "&to=" + today;
    if (f === "active") q = "?from=" + today + "&to=" + addDays(today, 120) + "&status=active";
    if (f === "cancelled") q = "?from=" + addDays(today, -60) + "&to=" + addDays(today, 120) + "&status=cancelled";
    if (f === "past") q = "?from=" + addDays(today, -30) + "&to=" + addDays(today, -1);
    $("agenda-list").innerHTML = '<p class="hint">Chargement…</p>';
    api("GET", "/bookings" + q).then(function (list) {
      if (f === "past") list.reverse();
      renderList($("agenda-list"), list);
    }, function (err) { $("agenda-list").innerHTML = '<p class="error">' + esc(errText(err)) + "</p>"; });
  }

  $("agenda-filter").addEventListener("change", loadAgenda);
  $("agenda-refresh").addEventListener("click", loadAgenda);

  document.addEventListener("click", function (e) {
    var item = e.target.closest("[data-booking]");
    if (item) openBooking(item.dataset.booking);
  });

  /* ---------- Détail ---------- */

  var current = null;

  function openBooking(id) {
    api("GET", "/bookings/" + encodeURIComponent(id)).then(function (b) {
      current = b;
      renderDrawer();
      $("drawer").hidden = false;
      $("backdrop").hidden = false;
    }, function (err) { alertMsg(errText(err)); });
  }

  function closeDrawer() {
    $("drawer").hidden = true;
    $("backdrop").hidden = true;
    current = null;
  }

  $("drawer-close").addEventListener("click", closeDrawer);
  $("backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("drawer").hidden) closeDrawer(); });

  function alertMsg(text) {
    var el = $("drawer-msg");
    if (el) el.textContent = text;
  }

  function renderDrawer() {
    var b = current;
    var rows = [
      ["Statut", pills(b)],
      ["Date", esc(longDate(b.date)) + " · " + esc(b.start) + "–" + esc(b.end)],
      ["Soins", b.services.map(function (s) { return esc(s.name.fr) + ' <span class="money">' + eur(s.priceCents) + "</span>"; }).join("<br>")],
      ["Total", '<span class="money">' + eur(b.total_cents) + "</span>"],
      [b.pay_full ? "Payé en ligne (totalité)" : "Acompte", '<span class="money">' + eur(b.deposit_cents) + "</span>" + (b.paid_at ? " · payé le " + esc(dateTime(b.paid_at)) : " · non payé")],
      ["Reste sur place", '<span class="money">' + eur(b.total_cents - b.deposit_cents) + "</span>" + (b.balance_paid_at ? " · réglé le " + esc(dateTime(b.balance_paid_at)) : "")],
      [b.mode === "gift" ? "Acheteur" : "Cliente", esc(b.client_name) + "<br>" + esc(b.client_email) + "<br>" + esc(b.client_phone)]
    ];
    if (b.mode === "gift") {
      rows.push(["Bénéficiaire", esc(b.gift_name) + ", " + esc(b.gift_age) + " ans<br>" + esc(b.gift_email)]);
      if (b.gift_message) rows.push(["Message", esc(b.gift_message)]);
      rows.push(["Code", b.gift_code ? "<b>" + esc(b.gift_code) + "</b>" + (b.gift_redeemed_at ? " · utilisé le " + esc(dateTime(b.gift_redeemed_at)) : " · non utilisé") : "—"]);
    }
    rows.push(["E-mails", b.emails_sent_at ? "envoyés le " + esc(dateTime(b.emails_sent_at)) : "non envoyés"]);
    rows.push(["Langue", b.lang === "en" ? "Anglais" : "Français"]);
    rows.push(["Réf.", esc(b.id)]);

    var actions = [];
    if (b.status === "confirmed") {
      actions.push('<button class="btn btn-dark btn-sm" data-act="complete">Terminé · reste réglé</button>');
      actions.push('<button class="btn btn-outline btn-sm" data-act="no_show">Absente</button>');
    }
    if (b.status === "no_show") actions.push('<button class="btn btn-dark btn-sm" data-act="complete">Terminé · reste réglé</button>');
    if (["completed", "no_show", "cancelled"].indexOf(b.status) !== -1 && b.paid_at) actions.push('<button class="btn btn-outline btn-sm" data-act="reopen">Remettre en confirmé</button>');
    if (["confirmed", "completed"].indexOf(b.status) !== -1) actions.push('<button class="btn btn-outline btn-sm" data-act="resend">Renvoyer les e-mails</button>');
    if (b.needs_attention) actions.push('<button class="btn btn-outline btn-sm" data-act="resolve">Marquer comme vérifié</button>');

    var cancel = ["confirmed", "pending_payment"].indexOf(b.status) !== -1
      ? '<div class="block-form"><b>Annuler ce rendez-vous</b><p class="hint">L\'acompte n\'est pas remboursé.</p>' +
        '<label class="radio"><input type="checkbox" id="cancel-notify" checked> Prévenir la cliente par e-mail</label>' +
        '<button class="btn btn-danger btn-sm" data-act="cancel">Annuler le rendez-vous</button></div>'
      : "";

    $("drawer-title").textContent = b.mode === "gift" ? "Carte cadeau" : "Rendez-vous";
    $("drawer-body").innerHTML =
      (b.needs_attention ? '<p class="notice warn">À vérifier : paiement arrivé après expiration (créneau peut-être déjà pris), montant inattendu ou e-mails non envoyés.</p>' : "") +
      '<dl class="dl">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="actions">' + actions.join("") + "</div>" +
      '<label>Note interne<textarea id="note" maxlength="1000">' + esc(b.admin_note || "") + '</textarea></label>' +
      '<div><button class="btn btn-outline btn-sm" data-act="note">Enregistrer la note</button></div>' +
      cancel +
      '<p class="status" id="drawer-msg" role="status"></p>';
  }

  $("drawer-body").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn || !current) return;
    var act = btn.dataset.act;
    var body = { action: act };
    if (act === "note") body.note = $("note").value;
    if (act === "cancel") body.notify = $("cancel-notify").checked;
    btn.disabled = true;
    api("POST", "/bookings/" + encodeURIComponent(current.id) + "/action", body).then(function (b) {
      current = b;
      renderDrawer();
      alertMsg(act === "resend" ? "E-mails renvoyés." : act === "note" ? "Note enregistrée." : "Mis à jour.");
      loadAgenda();
      if (!$("tab-calendrier").hidden) loadCalendar();
    }, function (err) {
      btn.disabled = false;
      alertMsg(errText(err));
    });
  });

  /* ---------- Calendrier ---------- */

  var calMonth = (function () { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); })();
  var calData = null;
  var selectedDay = null;

  function shiftMonth(n) {
    var p = calMonth.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1 + n, 1);
    calMonth = d.getFullYear() + "-" + pad(d.getMonth() + 1);
    loadCalendar();
  }

  $("cal-prev").addEventListener("click", function () { shiftMonth(-1); });
  $("cal-next").addEventListener("click", function () { shiftMonth(1); });

  function loadCalendar() {
    api("GET", "/calendar?month=" + calMonth).then(function (data) {
      calData = data;
      renderCalendar();
      if (selectedDay && selectedDay.slice(0, 7) === calMonth) loadDay(selectedDay);
    }, function (err) { $("cal-grid").innerHTML = '<p class="error">' + esc(errText(err)) + "</p>"; });
  }

  function renderCalendar() {
    var p = calMonth.split("-").map(Number);
    $("cal-title").textContent = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(p[0], p[1] - 1, 1));
    var html = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(function (d) { return '<span class="dow">' + d + "</span>"; }).join("");
    var lead = (new Date(p[0], p[1] - 1, 1).getDay() + 6) % 7;
    for (var i = 0; i < lead; i++) html += "<span></span>";
    calData.days.forEach(function (d) {
      var whole = d.blocks.some(function (b) { return !b.start; });
      var cls = "cday" + (d.closed ? " closed" : "") + (d.holiday ? " holiday" : "") + (whole ? " blocked" : "") +
        (d.date === calData.today ? " today" : "") + (d.date === selectedDay ? " selected" : "");
      var tags = [];
      if (d.holiday) tags.push(d.holiday);
      else if (whole) tags.push("Bloqué");
      else if (d.blocks.length) tags.push(d.blocks.length + " indispo.");
      else if (d.closed) tags.push("Fermé");
      html += '<button class="' + cls + '" data-day="' + d.date + '"><b>' + Number(d.date.slice(8)) + "</b>" +
        (d.bookings ? '<span class="count">' + d.bookings + " rdv</span>" : "") +
        tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</button>";
    });
    $("cal-grid").innerHTML = html;
  }

  $("cal-grid").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-day]");
    if (!btn) return;
    selectedDay = btn.dataset.day;
    renderCalendar();
    loadDay(selectedDay);
  });

  function loadDay(date) {
    var info = calData.days.filter(function (d) { return d.date === date; })[0];
    api("GET", "/bookings?from=" + date + "&to=" + date).then(function (list) {
      var html = "<h3>" + esc(longDate(date)) + "</h3>";
      if (info.holiday) html += '<p class="notice warn">Jour férié : ' + esc(info.holiday) + " (fermé)</p>";
      else if (info.closed) html += '<p class="notice warn">Fermé ce jour de la semaine (voir Réglages).</p>';

      html += info.blocks.length
        ? '<ul class="block-list">' + info.blocks.map(function (b) {
            return "<li><span>" + (b.start ? esc(b.start) + "–" + esc(b.end) : "Journée entière") + (b.reason ? " · " + esc(b.reason) : "") +
              '</span><button class="btn btn-ghost btn-sm" data-unblock="' + b.id + '">Retirer</button></li>';
          }).join("") + "</ul>"
        : '<p class="hint">Aucune indisponibilité.</p>';

      html += '<form class="block-form" id="block-form">' +
        "<b>Ajouter une indisponibilité</b>" +
        '<label class="radio"><input type="radio" name="kind" value="day" checked> Journée entière</label>' +
        '<label class="radio"><input type="radio" name="kind" value="range"> Plage horaire</label>' +
        '<div class="row"><label>De<input type="time" id="block-start" value="12:00"></label><label>À<input type="time" id="block-end" value="14:00"></label></div>' +
        '<label>Motif (facultatif)<input id="block-reason" maxlength="200" placeholder="Congés, formation…"></label>' +
        '<button class="btn btn-dark btn-sm" type="submit">Bloquer</button>' +
        '<p class="status" id="block-msg" role="status"></p></form>';

      html += "<b>Rendez-vous</b>";
      $("day-panel").innerHTML = html + '<div class="agenda-items" id="day-list"></div>';
      if (list.length) $("day-list").innerHTML = list.map(itemHtml).join("");
      else $("day-list").innerHTML = '<p class="hint">Aucun rendez-vous.</p>';
    });
  }

  $("day-panel").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-unblock]");
    if (!btn) return;
    api("DELETE", "/blocks/" + btn.dataset.unblock).then(loadCalendar);
  });

  $("day-panel").addEventListener("submit", function (e) {
    if (e.target.id !== "block-form") return;
    e.preventDefault();
    var range = e.target.querySelector('input[name="kind"]:checked').value === "range";
    var body = { date: selectedDay, reason: $("block-reason").value };
    if (range) { body.start = $("block-start").value; body.end = $("block-end").value; }
    api("POST", "/blocks", body).then(function (res) {
      loadCalendar();
      if (res.affected.length) {
        setTimeout(function () {
          var msg = $("block-msg");
          if (msg) msg.textContent = "Attention : " + res.affected.length + " rendez-vous déjà réservé(s) sur cette période. Contactez la cliente ou annulez-le depuis sa fiche.";
        }, 300);
      }
    }, function (err) { $("block-msg").textContent = errText(err); });
  });

  /* ---------- Cartes cadeau ---------- */

  var giftInfo = null;

  $("gift-form").addEventListener("submit", function (e) {
    e.preventDefault();
    lookupGift($("gift-code").value);
  });

  function lookupGift(code) {
    $("gift-result").innerHTML = '<p class="hint">Recherche…</p>';
    api("GET", "/gift/" + encodeURIComponent(code.trim())).then(function (info) {
      giftInfo = info;
      renderGift();
    }, function (err) {
      $("gift-result").innerHTML = '<p class="error">' + esc(err.code === "not_found" ? "Aucune carte cadeau avec ce code." : errText(err)) + "</p>";
    });
  }

  function renderGift(message) {
    var i = giftInfo, b = i.booking;
    var state;
    if (i.redeemed) state = '<p class="notice warn">Déjà utilisée le ' + esc(dateTime(b.gift_redeemed_at)) + ".</p>";
    else if (["confirmed", "no_show"].indexOf(b.status) === -1) state = '<p class="notice warn">Non valable : ' + esc(STATUS[b.status]) + ".</p>";
    else if (i.validToday) state = '<p class="notice">Valable aujourd\'hui.</p>';
    else if (i.expired) state = '<p class="notice warn">La date de validité est passée (' + esc(longDate(b.date)) + ").</p>";
    else state = '<p class="notice warn">Valable uniquement le ' + esc(longDate(b.date)) + ".</p>";

    var canRedeem = !i.redeemed && ["confirmed", "no_show"].indexOf(b.status) !== -1;
    $("gift-result").innerHTML = '<div class="gift-box">' +
      '<span class="gift-code">' + esc(b.gift_code) + "</span>" + state +
      '<dl class="dl">' +
        "<dt>Bénéficiaire</dt><dd>" + esc(b.gift_name) + ", " + esc(b.gift_age) + " ans</dd>" +
        "<dt>Offert par</dt><dd>" + esc(b.client_name) + " · " + esc(b.client_phone) + "</dd>" +
        "<dt>Rendez-vous</dt><dd>" + esc(longDate(b.date)) + " · " + esc(b.start) + "</dd>" +
        "<dt>Soins</dt><dd>" + esc(b.services.map(function (s) { return s.name.fr; }).join(" + ")) + "</dd>" +
        "<dt>Reste à régler</dt><dd class=\"money\">" + eur(b.total_cents - b.deposit_cents) + "</dd>" +
      "</dl>" +
      '<div class="actions">' +
        (canRedeem ? '<button class="btn btn-dark" data-redeem="' + (i.validToday ? "0" : "1") + '">' + (i.validToday ? "Valider le code" : "Valider quand même") + "</button>" : "") +
        '<button class="btn btn-outline" data-booking="' + esc(b.id) + '">Voir la fiche</button>' +
      "</div>" +
      '<p class="status" role="status">' + esc(message || "") + "</p></div>";
  }

  $("gift-result").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-redeem]");
    if (!btn) return;
    btn.disabled = true;
    api("POST", "/gift/" + encodeURIComponent(giftInfo.booking.gift_code) + "/redeem", { force: btn.dataset.redeem === "1" })
      .then(function (info) { giftInfo = info; renderGift("Code validé."); },
            function (err) { btn.disabled = false; renderGift(errText(err)); });
  });

  /* ---------- Réglages ---------- */

  function rangeHtml(r) {
    return '<span class="range"><input type="time" value="' + esc(r[0]) + '" aria-label="Début"> – <input type="time" value="' + esc(r[1]) + '" aria-label="Fin"></span>';
  }

  function loadSettings() {
    api("GET", "/settings").then(function (s) {
      loaded.settings = true;
      var order = [1, 2, 3, 4, 5, 6, 0];
      $("hours").innerHTML = order.map(function (d) {
        var list = s.openingHours[d] || [];
        var ranges = list.length ? list : [["09:30", "18:30"]];
        var second = ranges[1] || ["14:00", "18:30"];
        return '<div class="hours-row' + (list.length ? "" : " off") + '" data-dow="' + d + '">' +
          "<b>" + DAYS[d] + "</b>" +
          '<label class="radio"><input type="checkbox" class="open"' + (list.length ? " checked" : "") + "> Ouvert</label>" +
          '<div class="ranges">' + rangeHtml(ranges[0]) +
            '<label class="radio"><input type="checkbox" class="split"' + (ranges[1] ? " checked" : "") + "> Pause midi</label>" +
            '<span class="second"' + (ranges[1] ? "" : " hidden") + ">" + rangeHtml(second) + "</span>" +
          "</div></div>";
      }).join("");
      $("slot-step").value = String(s.slotStep);
      $("buffer").value = s.bufferMinutes;
    });
  }

  $("hours").addEventListener("change", function (e) {
    var row = e.target.closest(".hours-row");
    if (e.target.classList.contains("open")) row.classList.toggle("off", !e.target.checked);
    if (e.target.classList.contains("split")) row.querySelector(".second").hidden = !e.target.checked;
  });

  $("settings-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var hours = {};
    document.querySelectorAll(".hours-row").forEach(function (row) {
      var d = row.dataset.dow;
      if (!row.querySelector(".open").checked) { hours[d] = []; return; }
      var times = row.querySelectorAll('.ranges > .range input[type="time"]');
      var list = [[times[0].value, times[1].value]];
      if (row.querySelector(".split").checked) {
        var t2 = row.querySelectorAll('.second input[type="time"]');
        list.push([t2[0].value, t2[1].value]);
      }
      hours[d] = list;
    });
    $("settings-status").textContent = "";
    api("PUT", "/settings", {
      openingHours: hours,
      slotStep: Number($("slot-step").value),
      bufferMinutes: Number($("buffer").value)
    }).then(function () {
      $("settings-status").textContent = "Réglages enregistrés.";
    }, function (err) { $("settings-status").textContent = errText(err); });
  });

  /* ---------- Démarrage ---------- */

  api("GET", "/session").then(function (s) {
    if (s.authenticated) showApp(s); else showLogin();
  }, showLogin);
})();
