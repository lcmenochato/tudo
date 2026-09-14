"""Cliente Panda Pay API v1 — PIX."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

BASE_URL = os.environ.get("PANDAPAY_BASE_URL", "https://pandapay.click/api/v1").rstrip("/")


class PandaPayError(Exception):
    def __init__(self, message: str, code: str | None = None, status: int = 400):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)


def configured(api_key: str) -> bool:
    return bool(api_key.strip())


def _headers(api_key: str) -> dict[str, str]:
    # Panda Pay API keys are sent in the Authorization header.
    # Keep the credential server-side; never expose it to browser code.
    # Panda Pay (pandapay.click) exige o esquema Bearer no header Authorization.
    authorization = f"Bearer {api_key.strip()}"
    return {
        "Authorization": authorization,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "TiktokShop/1.0 (PandaPay)",
    }


def _request(method: str, path: str, api_key: str, body: dict | None = None, timeout: int = 30) -> dict:
    url = BASE_URL + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=_headers(api_key), method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            err = {"error": str(e), "code": "HTTP_ERROR"}
        raise PandaPayError(
            err.get("error") or err.get("message") or "Erro Panda Pay",
            code=err.get("code"),
            status=e.code,
        ) from e
    except urllib.error.URLError as e:
        raise PandaPayError("Falha de conexão com Panda Pay", code="NETWORK", status=502) from e


def create_pix(*, api_key: str, amount_cents: int, description: str, customer: dict, external_reference: str = "", metadata: dict | None = None) -> dict:
    body = {
        "method": "pix",
        "amount_cents": amount_cents,
        "description": description,
        "customer": {
            "email": customer.get("email", "cliente@email.com"),
            "name": customer.get("name", "Cliente"),
            "phone": customer.get("phone", "11999999999"),
        },
    }
    if external_reference:
        body["external_reference"] = external_reference
    if metadata:
        body["metadata"] = metadata
    return _request("POST", "/transactions", api_key, body)


def get_transaction(*, api_key: str, transaction_id: str) -> dict:
    return _request("GET", f"/transactions/{transaction_id}", api_key)


def transaction_id(tx: dict) -> str:
    return str(tx.get("id") or tx.get("transaction_id") or "")


def copy_paste(tx: dict) -> str:
    pix = tx.get("pix") or {}
    return str(
        pix.get("copy_paste")
        or pix.get("copyPaste")
        or pix.get("qr_code")
        or tx.get("copy_paste")
        or tx.get("copyPaste")
        or ""
    )


def map_status(status: str) -> str:
    s = (status or "").strip().lower()
    if s in {"paid", "approved", "completed", "complete", "succeeded", "success", "confirmed", "settled"}:
        return "paid"
    return "pending"


def to_frontend_response(tx: dict) -> dict:
    tx_id = transaction_id(tx)
    code = copy_paste(tx)
    qr_url = str((tx.get("pix") or {}).get("qr_code_url") or tx.get("qr_code_url") or "")
    if not qr_url and code:
        from urllib.parse import quote
        qr_url = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + quote(code, safe="")
    return {
        "copyPaste": code,
        "transactionId": tx_id,
        "gatewayTransactionId": tx_id,
        "orderId": tx_id,
        "qrCode": qr_url,
    }
