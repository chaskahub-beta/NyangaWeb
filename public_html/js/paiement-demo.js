/* Página de pago simulado (solo cuando SumUp no está configurado) */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var id = params.get("reservation");
  var token = params.get("t");
  var ok = document.getElementById("demo-ok");
  var fail = document.getElementById("demo-fail");
  var msg = document.getElementById("demo-msg");

  function back() {
    location.href = "./?reservation=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(token);
  }

  fetch("/api/dev/mock-pay/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(token))
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (d) {
      document.getElementById("demo-when").textContent = d.date ? d.date + " · " + d.start : "Carte cadeau";
      document.getElementById("demo-amount").textContent =
        new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(d.depositCents / 100);
      ok.disabled = false;
      fail.disabled = false;
    })
    .catch(function () {
      msg.textContent = "Paiement simulé indisponible (SumUp est peut-être configuré, ou le lien n'est pas valide).";
    });

  function pay(result) {
    ok.disabled = true;
    fail.disabled = true;
    fetch("/api/dev/mock-pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, t: token, result: result })
    }).then(back, back);
  }

  ok.addEventListener("click", function () { pay("ok"); });
  fail.addEventListener("click", function () { pay("fail"); });
})();
