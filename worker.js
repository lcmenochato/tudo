/**
 * Cloudflare Worker — integração Pix FlevoPag
 *
 * Secret obrigatório no Cloudflare:
 * FLEVO_API_KEY
 *
 * Rotas:
 * POST /api/public/pix/create
 * GET  /api/public/pix/status?id=ID_DA_TRANSACAO
 * POST /api/webhooks/flevopay
 */

const FLEVO_BASE_URL = "https://pagamento-processador.org.ua/api/v1";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const digits = (value) => String(value || "").replace(/\D/g, "");

function normalizedStatus(value) {
  const status = String(value || "").toLowerCase();

  if (
    [
      "approved",
      "paid",
      "success",
      "completed",
      "confirmed",
      "settled",
    ].includes(status)
  ) {
    return "paid";
  }

  if (
    [
      "failed",
      "refunded",
      "chargeback",
      "cancelled",
      "canceled",
      "expired",
      "rejected",
    ].includes(status)
  ) {
    return "failed";
  }

  return "pending";
}

async function flevoRequest(path, apiKey, options = {}) {
  const response = await fetch(FLEVO_BASE_URL + path, {
    ...options,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();

  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {
      message: "A gateway retornou uma resposta inválida.",
    };
  }

  if (!response.ok) {
    const message =
      data.message ||
      data.error ||
      data.detail ||
      "Não foi possível comunicar com a FlevoPag.";

    throw new Error(response.status + ": " + message);
  }

  return data;
}

async function createPix(request, env) {
  if (!env.FLEVO_API_KEY) {
    return json(
      {
        error: "Configure o secret FLEVO_API_KEY no Cloudflare.",
        code: "missing_gateway_config",
      },
      503
    );
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        error: "Corpo JSON inválido.",
        code: "invalid_json",
      },
      400
    );
  }

  const client = payload.client || {};

  const name = String(client.name || "").trim();
  const email = String(client.email || "").trim();
  const document = digits(client.document);
  const phone = digits(client.phone);

  const amount = Number(payload.amount);
  const amountCents = Math.round(amount * 100);

  if (!Number.isFinite(amount) || amountCents < 100) {
    return json(
      {
        error: "Valor do pagamento inválido.",
        code: "invalid_amount",
      },
      400
    );
  }

  if (!name || !email || !document || !phone) {
    return json(
      {
        error:
          "Preencha nome, e-mail, CPF/CNPJ e telefone para gerar o Pix.",
        code: "missing_customer",
      },
      400
    );
  }

  if (![11, 14].includes(document.length)) {
    return json(
      {
        error: "CPF/CNPJ inválido. Verifique os dados.",
        code: "invalid_document",
      },
      400
    );
  }

  const orderId = String(
    payload.orderId ||
      payload.order_id ||
      "pedido_" + crypto.randomUUID()
  ).slice(0, 100);

  const products = Array.isArray(payload.products)
    ? payload.products
    : [];

  const description = String(
    products.find((product) => product && product.name)?.name ||
      "Pedido do site"
  ).slice(0, 180);

  const transaction = {
    amount: amountCents,
    description,
    reference: orderId,
    source: "api_externa",
    customer: {
      name,
      email,
      document,
      phone,
    },
  };

  if (env.FLEVO_WEBHOOK_URL) {
    transaction.postback_url = env.FLEVO_WEBHOOK_URL;
  }

  try {
    const result = await flevoRequest(
      "/transaction",
      env.FLEVO_API_KEY,
      {
        method: "POST",
        body: JSON.stringify(transaction),
      }
    );

    const txId = String(
      result.transaction_id ?? result.id ?? ""
    );

    const copyPaste = String(
      result.qr_code ||
        result.pix_code ||
        result.copy_paste ||
        ""
    );

    if (!txId || !copyPaste) {
      return json(
        {
          error:
            "A FlevoPag não retornou o identificador e o código Pix esperados.",
          code: "invalid_gateway_response",
        },
        502
      );
    }

    const qrCode =
      result.qr_code_base64 ||
      (
        "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" +
        encodeURIComponent(copyPaste)
      );

    return json({
      copyPaste,
      transactionId: txId,
      gatewayTransactionId: txId,
      orderId: String(result.id || orderId),
      qrCode,
    });
  } catch (error) {
    return json(
      {
        error: String(
          error.message || "Falha ao criar cobrança Pix."
        ),
        code: "gateway_error",
      },
      502
    );
  }
}

async function pixStatus(request, env) {
  if (!env.FLEVO_API_KEY) {
    return json(
      {
        error: "Gateway não configurada.",
        code: "missing_gateway_config",
      },
      503
    );
  }

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (!id || id.length > 200) {
    return json(
      {
        error: "Informe o ID da transação.",
        code: "missing_transaction_id",
      },
      400
    );
  }

  try {
    const result = await flevoRequest(
      "/query?action=get_transaction&id=" +
        encodeURIComponent(id),
      env.FLEVO_API_KEY
    );

    const status = normalizedStatus(
      result.status || result.payment_status
    );

    return json({
      status,
      transactionId: String(result.id || id),
    });
  } catch (error) {
    return json(
      {
        error: String(
          error.message ||
            "Não foi possível consultar o pagamento."
        ),
        code: "gateway_error",
      },
      502
    );
  }
}

async function webhook(request) {
  try {
    await request.json();
  } catch {
    return json(
      {
        error: "JSON inválido.",
      },
      400
    );
  }

  return json({
    received: true,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      request.method === "OPTIONS" &&
      url.pathname.startsWith("/api/")
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": url.origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (
      url.pathname === "/api/public/pix/create" &&
      request.method === "POST"
    ) {
      return createPix(request, env);
    }

    if (
      url.pathname === "/api/public/pix/status" &&
      request.method === "GET"
    ) {
      return pixStatus(request, env);
    }

    if (
      url.pathname === "/api/webhooks/flevopay" &&
      request.method === "POST"
    ) {
      return webhook(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json(
      {
        error:
          "Assets do site não configurados. Configure o binding ASSETS no Cloudflare.",
      },
      404
    );
  },
};
