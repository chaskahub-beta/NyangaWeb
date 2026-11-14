"use strict";

/*
  Correos. Con SMTP configurado se envían de verdad; si no, se guardan como
  archivos .html en data/outbox para poder revisarlos.
*/

const fs = require("fs");
const path = require("path");
const { buildIcs, calendarLinks } = require("./ics");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function eur(cents, lang) {
  return new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", {
    style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

function longDate(key, lang) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const T = {
  fr: {
    hello: (n) => `Bonjour ${n},`,
    confirmedSubject: "Votre réservation chez Nyanga Beauty est confirmée",
    confirmedIntro: "Merci, votre acompte a bien été reçu. Votre rendez-vous est confirmé.",
    giftBuyerSubject: "Votre carte cadeau Nyanga Beauty",
    giftBuyerIntro: (n) => `Merci, votre acompte a bien été reçu. Voici la carte cadeau offerte à ${n}.`,
    giftRecipientSubject: (n) => `${n} vous offre un moment chez Nyanga Beauty`,
    giftRecipientIntro: (n) => `${n} vous offre un soin chez Nyanga Beauty & Spa.`,
    cancelledSubject: "Votre rendez-vous chez Nyanga Beauty est annulé",
    cancelledIntro: "Votre rendez-vous a été annulé. Pour toute question, contactez-nous directement.",
    date: "Date",
    services: "Soins",
    total: "Total des soins",
    deposit: "Acompte payé (non remboursable)",
    rest: "Reste à régler sur place",
    code: "Code de la carte cadeau",
    validOn: "Valable uniquement le",
    message: "Message",
    lost: "En cas de perte du code, contactez directement Nyanga Beauty.",
    bring: "Présentez ce code le jour du rendez-vous.",
    signoff: "À très bientôt,<br>Nyanga Beauty & Spa",
    addCalendar: "Ajouter à mon agenda",
    calendarApple: "iPhone · Outlook · Android",
    calendarGoogle: "Google Agenda",
    calendarHint: "Le rendez-vous est aussi en pièce jointe (.ics), avec un rappel la veille et 2 h avant."
  },
  en: {
    hello: (n) => `Hello ${n},`,
    confirmedSubject: "Your Nyanga Beauty booking is confirmed",
    confirmedIntro: "Thank you, your deposit has been received. Your appointment is confirmed.",
    giftBuyerSubject: "Your Nyanga Beauty gift card",
    giftBuyerIntro: (n) => `Thank you, your deposit has been received. Here is the gift card for ${n}.`,
    giftRecipientSubject: (n) => `${n} is treating you to Nyanga Beauty`,
    giftRecipientIntro: (n) => `${n} is giving you a treatment at Nyanga Beauty & Spa.`,
    cancelledSubject: "Your Nyanga Beauty appointment is cancelled",
    cancelledIntro: "Your appointment has been cancelled. For any question, please contact us directly.",
    date: "Date",
    services: "Treatments",
    total: "Treatments total",
    deposit: "Deposit paid (non-refundable)",
    rest: "Left to pay on site",
    code: "Gift card code",
    validOn: "Valid only on",
    message: "Message",
    lost: "If the code is lost, please contact Nyanga Beauty directly.",
    bring: "Show this code on the day of the appointment.",
    signoff: "See you soon,<br>Nyanga Beauty & Spa",
    addCalendar: "Add to my calendar",
    calendarApple: "iPhone · Outlook · Android",
    calendarGoogle: "Google Calendar",
    calendarHint: "The appointment is also attached (.ics), with a reminder the day before and 2 h before."
  }
};

function layout(inner) {
  return `<!doctype html><html><body style="margin:0;background:#F6EFE6;font-family:Georgia,serif;color:#2E140E">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:22px;letter-spacing:4px;color:#6E2A1E;text-transform:uppercase">Nyanga</div>
<div style="font-size:11px;letter-spacing:4px;color:#6B4A3F;margin-bottom:24px">beauty &amp; spa</div>
<div style="background:#FBF7F2;border:1px solid #E3D3BF;border-radius:14px;padding:22px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55">
${inner}
</div></div></body></html>`;
}

function row(label, value) {
  return `<tr><td style="padding:6px 0;color:#6B4A3F">${label}</td><td style="padding:6px 0;text-align:right">${value}</td></tr>`;
}

function detailsTable(b, lang) {
  const t = T[lang];
  const services = JSON.parse(b.services_json);
  return `<table style="width:100%;border-collapse:collapse;margin:14px 0">
${row(t.date, esc(longDate(b.date, lang)) + " · " + esc(b.start))}
${services.map((s) => row(esc(s.name[lang] || s.name.fr), eur(s.priceCents, lang))).join("")}
${row("<b>" + t.total + "</b>", "<b>" + eur(b.total_cents, lang) + "</b>")}
${row(t.deposit, eur(b.deposit_cents, lang))}
${row(t.rest, eur(b.total_cents - b.deposit_cents, lang))}
</table>`;
}

function codeBlock(b, lang) {
  const t = T[lang];
  return `<div style="background:#3E1A12;color:#F6EFE6;border-radius:12px;padding:18px;margin:14px 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#E3C98D">${t.code}</div>
<div style="font-size:26px;letter-spacing:4px;color:#E3C98D;margin:6px 0">${esc(b.gift_code)}</div>
<div style="font-size:13px">${t.validOn} ${esc(longDate(b.date, lang))} · ${esc(b.start)}</div>
</div>`;
}

function btn(href, label) {
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:999px;background:#6E2A1E;color:#F6EFE6;text-decoration:none;font-size:14px">${label}</a>`;
}

/** Botones "Ajouter à mon agenda". */
function calendarBlock(b, lang, opts) {
  const t = T[lang];
  const links = calendarLinks(b, { publicUrl: opts.publicUrl, address: opts.address, lang });
  return `<div style="margin:16px 0"><div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#6B4A3F;margin-bottom:6px">${t.addCalendar}</div>
${btn(links.ics, t.calendarApple)}${btn(links.google, t.calendarGoogle)}
<div style="font-size:12px;color:#6B4A3F;margin-top:6px">${t.calendarHint}</div></div>`;
}

function icsAttachment(b, lang, opts, extra) {
  return {
    filename: "nyanga-rendez-vous.ics",
    contentType: "text/calendar; charset=utf-8; method=" + (extra && extra.cancel ? "CANCEL" : "PUBLISH"),
    content: buildIcs(b, { lang, address: opts.address, ...extra })
  };
}

/**
 * Construye los correos de una reserva confirmada.
 * opts: { companyEmail, publicUrl, address }
 */
function confirmationEmails(b, opts) {
  const lang = b.lang === "en" ? "en" : "fr";
  const t = T[lang];
  const mails = [];
  const companyEmail = opts.companyEmail;
  // El evento va a quien asiste: la clienta, o el beneficiario de la carte cadeau.
  const cal = calendarBlock(b, lang, opts);
  const ics = icsAttachment(b, lang, opts);

  if (b.mode === "gift") {
    mails.push({
      to: b.client_email,
      subject: t.giftBuyerSubject,
      html: layout(`<p>${t.hello(esc(b.client_name))}</p><p>${t.giftBuyerIntro(esc(b.gift_name))}</p>
${codeBlock(b, lang)}${detailsTable(b, lang)}<p style="font-size:13px;color:#6B4A3F">${t.lost}</p><p>${t.signoff}</p>`)
    });
    mails.push({
      to: b.gift_email,
      subject: t.giftRecipientSubject(b.client_name),
      html: layout(`<p>${t.hello(esc(b.gift_name))}</p><p>${t.giftRecipientIntro(esc(b.client_name))}</p>
${b.gift_message ? `<p style="font-style:italic;border-left:3px solid #C9A24A;padding-left:12px">${esc(b.gift_message)}</p>` : ""}
${codeBlock(b, lang)}<p>${t.bring}</p>${cal}<p style="font-size:13px;color:#6B4A3F">${t.lost}</p><p>${t.signoff}</p>`),
      attachments: [ics]
    });
  } else {
    mails.push({
      to: b.client_email,
      subject: t.confirmedSubject,
      html: layout(`<p>${t.hello(esc(b.client_name))}</p><p>${t.confirmedIntro}</p>${detailsTable(b, lang)}${cal}<p>${t.signoff}</p>`),
      attachments: [ics]
    });
  }

  mails.push(companyEmail && companyNotice(b, companyEmail, opts));
  return mails.filter(Boolean);
}

/** Aviso a la empresa (siempre en francés). */
function companyNotice(b, companyEmail, opts) {
  const kind = b.mode === "gift" ? "Carte cadeau" : "Réservation";
  const gift = b.mode === "gift"
    ? `<p><b>Bénéficiaire :</b> ${esc(b.gift_name)}, ${esc(b.gift_age)} ans · ${esc(b.gift_email)}<br>
<b>Code :</b> ${esc(b.gift_code)}${b.gift_message ? `<br><b>Message :</b> ${esc(b.gift_message)}` : ""}</p>`
    : "";
  const attention = b.needs_attention
    ? `<p style="color:#A8553C"><b>À vérifier :</b> le paiement est arrivé après l'expiration de la réservation et le créneau était peut-être déjà pris.</p>`
    : "";
  return {
    to: companyEmail,
    subject: `${kind} · ${longDate(b.date, "fr")} ${b.start} · ${b.client_name}`,
    html: layout(`<p><b>${kind} confirmée</b> (acompte payé)</p>${attention}
<p><b>Cliente :</b> ${esc(b.client_name)}<br>${esc(b.client_email)} · ${esc(b.client_phone)}</p>${gift}
${detailsTable(b, "fr")}<p style="font-size:12px;color:#6B4A3F">Le rendez-vous est en pièce jointe (.ics) pour l'ajouter à votre agenda.<br>Réf. ${esc(b.id)}</p>`),
    attachments: [icsAttachment(b, "fr", opts, { audience: "company" })]
  };
}

/** Anulación: el .ics adjunto (mismo UID, METHOD:CANCEL) quita el evento del calendario. */
function cancellationEmail(b, opts) {
  const lang = b.lang === "en" ? "en" : "fr";
  const t = T[lang];
  const to = b.mode === "gift" ? [b.client_email, b.gift_email] : [b.client_email];
  return to.map((addr) => ({
    to: addr,
    subject: t.cancelledSubject,
    html: layout(`<p>${t.cancelledIntro}</p>${detailsTable(b, lang)}<p>${t.signoff}</p>`),
    attachments: [icsAttachment(b, lang, opts || {}, { cancel: true })]
  }));
}

function createMailer(config) {
  let transport = null;
  if (config.mailMode === "smtp") {
    const nodemailer = require("nodemailer");
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
    });
  }

  async function send(mail) {
    if (transport) {
      await transport.sendMail({ from: config.mail.from, ...mail });
      return;
    }
    fs.mkdirSync(config.outboxDir, { recursive: true });
    const safeTo = mail.to.replace(/[^a-z0-9@._-]/gi, "_");
    const file = path.join(config.outboxDir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeTo}.html`);
    const header = `<!-- To: ${esc(mail.to)} | Subject: ${esc(mail.subject)} -->\n`;
    fs.writeFileSync(file, header + mail.html, "utf8");
    (mail.attachments || []).forEach((a, i) => {
      fs.writeFileSync(file.replace(/\.html$/, `-${i + 1}-${a.filename}`), a.content, "utf8");
    });
  }

  async function sendAll(mails) {
    const results = await Promise.allSettled(mails.map(send));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      failed.forEach((f) => console.error("[mail] envoi échoué:", f.reason && f.reason.message));
      throw new Error("mail_failed");
    }
  }

  return { mode: config.mailMode, send, sendAll };
}

module.exports = { createMailer, confirmationEmails, cancellationEmail, eur, longDate };
