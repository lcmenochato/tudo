#!/usr/bin/env python3
"""Servidor local do funil — arquivos estáticos + API PIX (Panda Pay)."""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent


def load_dotenv():
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and key not in os.environ:
            os.environ[key] = val


load_dotenv()

import cloak
import pandapay
import tiktok_events

PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "127.0.0.1")
tiktok_events.ACCESS_TOKEN = os.environ.get("TIKTOK_ACCESS_TOKEN", tiktok_events.ACCESS_TOKEN)
tiktok_events.PIXEL_ID = os.environ.get("TIKTOK_PIXEL_ID", tiktok_events.PIXEL_ID)

PANDAPAY_API_KEY = os.environ.get("PANDAPAY_API_KEY", "")
USE_PANDAPAY = pandapay.configured(PANDAPAY_API_KEY)

# tx_id -> {created, amount, order_id, payload, tt_events, paid_at?}
TRANSACTIONS: dict[str, dict] = {}
AUTO_PAY_SECONDS = 8


def make_pix_code(amount: float, tx_id: str) -> str:
    return (
        "00020126580014br.gov.bcb.pix0136"
        + tx_id
        + "520400005303986540"
        + f"{amount:.2f}"
        + "5802BR5913INOX HOME6009SAO PAULO62070503***6304ABCD"
    )


def digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def product_description(payload: dict) -> str:
    products = payload.get("products") or []
    if products and isinstance(products[0], dict):
        return str(products[0].get("name") or "Pedido")
    return "Pedido"


def customer_from_payload(payload: dict) -> dict:
    client = payload.get("client") or {}
    return {
        "name": str(client.get("name") or "Cliente").strip() or "Cliente",
        "email": str(client.get("email") or "cliente@email.com").strip() or "cliente@email.com",
        "document": digits(str(client.get("document") or "")),
        "phone": digits(str(client.get("phone") or "")) or "11999999999",
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            payload = {}

        if path == "/api/public/pix/create":
            self._pix_create(payload)
            return
        if path == "/api/webhooks/pandapay":
            self._pandapay_webhook(payload)
            return
        if path == "/api/public/analytics/upsell-redirect":
            self._json(200, {"ok": True})
            return
        if path == "/api/public/support/chat":
            self._support_chat(payload)
            return
        if path.startswith("/~api/"):
            self._json(200, {"ok": True})
            return

        self.send_error(404)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/public/pix/status":
            qs = parse_qs(urlparse(self.path).query)
            tx_raw = (qs.get("id") or [""])[0]
            self._pix_status(tx_raw)
            return
        if path.startswith("/~api/"):
            self._json(200, {"ok": True})
            return

        if path == "/":
            self._serve_root_with_cloak()
            return

        route = path.strip("/")
        wrapper = ROOT / route / "index.html"
        if route and wrapper.is_file() and not Path(ROOT / route).suffix:
            self.path = f"/{route}/index.html"

        return super().do_GET()

    def _serve_html(self, code: int, html: str, extra_headers: dict | None = None):
        raw = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def _serve_root_with_cloak(self):
        decision = cloak.decide(self.headers, self.client_address[0], self.path)

        if decision != "allow":
            self._serve_html(200, cloak.white_page_html())
            return

        if cloak.PRIMARY_URL:
            self.send_response(302)
            self.send_header("Location", cloak.PRIMARY_URL)
            self.end_headers()
            return

        index = ROOT / "index.html"
        if index.is_file():
            self._serve_html(200, index.read_text(encoding="utf-8"))
            return

        self.send_error(404)

    def _json(self, code: int, data: dict):
        raw = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _store_transaction(self, tx_id: str, amount: float, order_id: str, payload: dict):
        TRANSACTIONS[tx_id] = {
            "created": time.time(),
            "amount": amount,
            "order_id": order_id,
            "payload": payload,
            "tt_events": {},
        }

    def _track_initiate_checkout(self, order_id: str, amount: float, payload: dict):
        page_url = str((payload.get("fb") or {}).get("eventSourceUrl") or "")
        tiktok_events.track_initiate_checkout(
            event_id=f"checkout_{order_id}",
            amount=amount,
            payload=payload,
            page_url=page_url,
            client_ip=self.client_address[0],
            user_agent=self.headers.get("User-Agent", ""),
        )

    def _mark_paid(self, tx_id: str) -> dict | None:
        tx = TRANSACTIONS.get(tx_id)
        if not tx:
            return None
        now = time.time()
        if not tx.get("paid_at"):
            tx["paid_at"] = now
            if not tx.get("tt_events", {}).get("CompletePayment"):
                payload = tx.get("payload") or {}
                order_id = tx.get("order_id") or tx_id
                event_id = f"pix_{order_id}"
                page_url = str((payload.get("fb") or {}).get("eventSourceUrl") or "")
                ok = tiktok_events.track_complete_payment(
                    event_id=event_id,
                    amount=tx.get("amount") or 0,
                    payload=payload,
                    page_url=page_url,
                    client_ip=self.client_address[0],
                    user_agent=self.headers.get("User-Agent", ""),
                )
                tx.setdefault("tt_events", {})["CompletePayment"] = ok
        return tx

    def _pix_create(self, payload: dict):
        doc = digits(str((payload.get("client") or {}).get("document") or ""))
        if doc and (len(doc) != 11 or doc == "00000000000"):
            self._json(400, {"code": "invalid_document", "error": "CPF inválido. Verifique os dados."})
            return

        amount = float(payload.get("amount") or 61.90)

        if USE_PANDAPAY:
            self._pix_create_pandapay(payload, amount)
            return
        self._pix_create_mock(payload, amount)

    def _pix_create_pandapay(self, payload: dict, amount: float):
        customer = customer_from_payload(payload)
        amount_cents = int(round(amount * 100))
        if amount_cents <= 0:
            self._json(400, {"code": "invalid_amount", "error": "Valor inválido."})
            return

        order_id = str(payload.get("orderId") or payload.get("order_id") or f"ord_{int(time.time())}_{uuid.uuid4().hex[:8]}")
        metadata = {"source": "TiktokShop", "order_id": order_id}

        try:
            pp_tx = pandapay.create_pix(
                api_key=PANDAPAY_API_KEY,
                amount_cents=amount_cents,
                description=product_description(payload),
                customer=customer,
                external_reference=order_id,
                metadata=metadata,
            )
        except pandapay.PandaPayError as e:
            code = 400 if e.status < 500 else 502
            self._json(code, {"error": e.message, "code": e.code or "gateway_error"})
            return

        tx_id = pandapay.transaction_id(pp_tx)
        copy_paste = pandapay.copy_paste(pp_tx)
        if not tx_id or not copy_paste:
            self._json(502, {"error": "Resposta inválida do Panda Pay PIX.", "code": "gateway_error"})
            return

        self._store_transaction(tx_id, amount, order_id, payload)
        self._track_initiate_checkout(order_id, amount, payload)
        self._json(200, pandapay.to_frontend_response(pp_tx))

    def _pix_create_mock(self, payload: dict, amount: float):
        tx_id = uuid.uuid4().hex[:24]
        order_id = f"ord_{int(time.time())}_{tx_id[:8]}"
        copy_paste = make_pix_code(amount, tx_id)

        self._store_transaction(tx_id, amount, order_id, payload)
        self._track_initiate_checkout(order_id, amount, payload)

        self._json(
            200,
            {
                "copyPaste": copy_paste,
                "transactionId": tx_id,
                "gatewayTransactionId": tx_id,
                "orderId": order_id,
                "qrCode": (
                    "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + copy_paste
                ),
            },
        )

    def _pix_status(self, tx_raw: str):
        tx_ids = [t.strip() for t in re.split(r"[,;]", tx_raw) if t.strip()]
        if not tx_ids:
            self._json(200, {"status": "pending"})
            return

        if USE_PANDAPAY:
            self._pix_status_pandapay(tx_ids)
            return
        self._pix_status_mock(tx_ids)

    def _pix_status_pandapay(self, tx_ids: list[str]):
        for tx_id in tx_ids:
            local = TRANSACTIONS.get(tx_id)
            if local and local.get("paid_at"):
                self._json(200, {"status": "paid", "transactionId": tx_id})
                return

            try:
                pp_tx = pandapay.get_transaction(api_key=PANDAPAY_API_KEY, transaction_id=tx_id)
            except pandapay.PandaPayError:
                continue

            status = pandapay.map_status(str(pp_tx.get("status") or pp_tx.get("payment_status") or ""))
            if status == "paid":
                if not local:
                    amount_raw = pp_tx.get("amount_cents") or pp_tx.get("amount") or 0
                    amount = float(amount_raw) / 100
                    self._store_transaction(tx_id, amount, tx_id, {})
                self._mark_paid(tx_id)
                self._json(200, {"status": "paid", "transactionId": tx_id})
                return

        self._json(200, {"status": "pending"})

    def _pix_status_mock(self, tx_ids: list[str]):
        now = time.time()
        for tx_id in tx_ids:
            tx = TRANSACTIONS.get(tx_id)
            if not tx:
                continue
            if tx.get("paid_at") or (now - tx["created"]) >= AUTO_PAY_SECONDS:
                self._mark_paid(tx_id)
                self._json(200, {"status": "paid", "transactionId": tx_id})
                return
        self._json(200, {"status": "pending"})

    def _pandapay_webhook(self, payload: dict):
        event = str(payload.get("event") or payload.get("type") or "").lower()
        data = payload.get("data") or payload.get("transaction") or payload
        tx_id = pandapay.transaction_id(data)
        status = pandapay.map_status(str(data.get("status") or data.get("payment_status") or ""))
        if tx_id and (status == "paid" or event in {"transaction.paid", "payment.paid", "paid", "transaction.completed"}):
            if tx_id not in TRANSACTIONS:
                amount_raw = data.get("amount_cents") or data.get("amount") or 0
                self._store_transaction(tx_id, float(amount_raw) / 100, tx_id, {})
            self._mark_paid(tx_id)
        self._json(200, {"ok": True})

    def _support_chat(self, payload: dict):
        messages = payload.get("messages") or []
        last = ""
        for m in reversed(messages):
            if isinstance(m, dict) and m.get("role") == "user":
                last = str(m.get("content") or "").strip().lower()
                break

        if any(w in last for w in ("entrega", "chega", "prazo", "demora", "quando")):
            reply = (
                "Seu pedido chega em 5 a 13 dias úteis com frete grátis. "
                "Assim que o pagamento PIX for confirmado, você recebe o código de rastreio no e-mail cadastrado."
            )
        elif any(w in last for w in ("rastreio", "rastrear", "codigo", "código", "correio")):
            reply = (
                "O rastreio é enviado automaticamente para o e-mail informado no checkout "
                "após a confirmação do PIX. Verifique também a caixa de spam."
            )
        elif any(w in last for w in ("pix", "pagamento", "pagar", "qr")):
            reply = (
                "O pagamento é 100% via PIX. Na etapa final do checkout, copie o código ou escaneie o QR Code. "
                "A confirmação costuma ser instantânea."
            )
        elif any(w in last for w in ("cor", "cores", "bege", "preta", "marrom", "rosa")):
            reply = (
                "As cores disponíveis são Preta e Bege. Marrom e Rosa estão esgotadas. "
                "Você escolhe a cor ao clicar em Comprar Agora, antes de ir ao checkout."
            )
        elif any(w in last for w in ("troca", "devolu", "garantia", "reembolso")):
            reply = (
                "Você tem devolução gratuita e reembolso automático por danos. "
                "A garantia do vendedor é de 2 anos."
            )
        elif any(w in last for w in ("preço", "preco", "valor", "quanto")):
            reply = "O Kit 10 Peças Colinox 02 está por R$ 61,90 com frete grátis na promoção relâmpago."
        elif any(w in last for w in ("oi", "olá", "ola", "bom dia", "boa tarde", "boa noite")):
            reply = (
                "Olá! Sou o assistente da Inox Home Online. "
                "Posso ajudar com entrega, rastreio, PIX, cores e trocas. Como posso ajudar?"
            )
        else:
            reply = (
                "Obrigado pela mensagem! Para entrega, rastreio, pagamento PIX ou escolha de cor, "
                "é só me perguntar. Se já comprou, confira o e-mail usado no checkout para atualizações."
            )

        self._json(200, {"reply": reply})


def main():
    httpd = HTTPServer((HOST, PORT), Handler)
    print(f"Funil: http://{HOST}:{PORT}/")
    if USE_PANDAPAY:
        print("PIX: Panda Pay (produção)")
        print(f"Webhook: POST http://localhost:{PORT}/api/webhooks/pandapay")
    else:
        print(f"PIX: mock local (auto-confirma em {AUTO_PAY_SECONDS}s)")
        print("Defina PANDAPAY_API_KEY no .env para PIX real")
    if tiktok_events.ACCESS_TOKEN:
        print(f"TikTok Events API ativo (pixel {tiktok_events.PIXEL_ID})")
    else:
        print("TikTok Events API: defina TIKTOK_ACCESS_TOKEN no .env")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
