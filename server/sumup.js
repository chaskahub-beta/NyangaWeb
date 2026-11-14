"use strict";

/*
  Pagos con SumUp (Hosted Checkout).
  - createCheckout: crea un cobro con el importe exacto del acompte y devuelve
    el enlace de pago (hosted_checkout_url).
  - getCheckout: consulta el estado real del cobro. Nunca nos fiamos del aviso
    del webhook: siempre volvemos a preguntar a SumUp.

  Sin SUMUP_API_KEY / SUMUP_MERCHANT_CODE funciona en modo simulado: el enlace
  lleva a /paiement-demo.html y el estado lo marca esa página de prueba.
*/

function createPayments(config) {
  const mock = config.paymentsMode !== "sumup";
  const mockStore = new Map(); // id → { status, amount, reference }

  async function api(method, path, body) {
    const res = await fetch(config.sumup.apiBase + path, {
      method,
      headers: {
        Authorization: "Bearer " + config.sumup.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error("sumup_error");
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  /**
    booking: { id, token, deposit_cents, date, start }
    reference: referencia única del cobro (un nuevo intento = nueva referencia)
  */
  async function createCheckout(booking, reference, description) {
    const amount = booking.deposit_cents / 100;
    const redirectUrl = `${config.publicUrl}/?reservation=${booking.id}&t=${booking.token}`;

    if (mock) {
      const id = "mock_" + reference;
      mockStore.set(id, { status: "PENDING", amount, currency: "EUR", reference });
      return {
        id,
        url: `${config.publicUrl}/paiement-demo.html?reservation=${booking.id}&t=${booking.token}`
      };
    }

    const data = await api("POST", "/v0.1/checkouts", {
      checkout_reference: reference,
      amount,
      currency: "EUR",
      merchant_code: config.sumup.merchantCode,
      description,
      return_url: `${config.publicUrl}/api/payments/sumup/webhook`,
      redirect_url: redirectUrl,
      hosted_checkout: { enabled: true }
    });

    if (!data || !data.id || !data.hosted_checkout_url) {
      const err = new Error("sumup_no_hosted_url");
      err.details = data;
      throw err;
    }
    return { id: data.id, url: data.hosted_checkout_url };
  }

  /** Devuelve { status: 'PAID'|'PENDING'|'FAILED'|'EXPIRED', amount, currency, reference } */
  async function getCheckout(id) {
    if (mock) {
      const c = mockStore.get(id);
      if (!c) return { status: "EXPIRED" };
      return { ...c };
    }
    const data = await api("GET", "/v0.1/checkouts/" + encodeURIComponent(id));
    return {
      status: String(data.status || "").toUpperCase(),
      amount: Number(data.amount),
      currency: data.currency,
      reference: data.checkout_reference
    };
  }

  /** Solo en modo simulado: marca el resultado del pago de prueba. */
  function mockSetStatus(id, status) {
    if (!mock) throw new Error("not_mock");
    const c = mockStore.get(id);
    if (!c) return false;
    c.status = status;
    return true;
  }

  return { mode: mock ? "mock" : "sumup", createCheckout, getCheckout, mockSetStatus };
}

module.exports = { createPayments };
