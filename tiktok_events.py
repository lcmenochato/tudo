"""TikTok Events API 2.0 — server-side (dedup com pixel browser via event_id)."""

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request

PIXEL_ID = os.environ.get("TIKTOK_PIXEL_ID", "DALKOK3C77UC8FLKA4OG")
ACCESS_TOKEN = os.environ.get("TIKTOK_ACCESS_TOKEN", "")
API_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/"

PRODUCT = {
    "content_id": "kit-colinox-02",
    "content_name": "Kit 10 Peças Colinox 02",
    "content_type": "product",
}


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _norm_email(email: str) -> str:
    return str(email or "").strip().lower()


def _norm_phone(phone: str) -> str:
    p = re.sub(r"\D", "", str(phone or ""))
    if p and len(p) <= 11:
        p = "55" + p
    return p


def _user_from_payload(payload: dict, client_ip: str = "", user_agent: str = "") -> dict:
    client = payload.get("client") or {}
    fb = payload.get("fb") or {}
    utm = payload.get("utm") or {}

    user: dict = {}
    email = _norm_email(client.get("email") or "")
    phone = _norm_phone(client.get("phone") or client.get("telefone") or "")

    if email:
        user["email"] = _sha256(email)
    if phone:
        user["phone"] = _sha256(phone)

    ext = fb.get("externalId") or utm.get("external_id") or ""
    if ext:
        user["external_id"] = _sha256(str(ext))

    ttclid = utm.get("ttclid") or ""
    if ttclid:
        user["ttclid"] = ttclid

    ip = client_ip or fb.get("ip") or ""
    if ip:
        user["ip"] = ip

    ua = user_agent or fb.get("userAgent") or ""
    if ua:
        user["user_agent"] = ua

    return user


def _properties(amount: float) -> dict:
    return {
        "currency": "BRL",
        "value": float(amount or 0),
        "content_type": "product",
        "contents": [
            {
                **PRODUCT,
                "quantity": 1,
                "price": float(amount or 0),
            }
        ],
    }


def send_event(
    event: str,
    *,
    event_id: str,
    amount: float,
    payload=None,
    page_url: str = "",
    client_ip: str = "",
    user_agent: str = "",
) -> bool:
    if not ACCESS_TOKEN:
        return False

    user = _user_from_payload(payload or {}, client_ip, user_agent)
    data_item: dict = {
        "event": event,
        "event_time": int(time.time()),
        "event_id": event_id,
        "user": user,
        "properties": _properties(amount),
    }

    if page_url:
        data_item["page"] = {"url": page_url}

    body = {
        "event_source": "web",
        "event_source_id": PIXEL_ID,
        "data": [data_item],
    }

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Access-Token": ACCESS_TOKEN,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = json.loads(resp.read().decode("utf-8") or "{}")
            return result.get("code") == 0
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return False


def track_initiate_checkout(**kwargs) -> bool:
    eid = kwargs.pop("event_id", "") or f"checkout_{int(time.time())}"
    return send_event("InitiateCheckout", event_id=eid, **kwargs)


def track_complete_payment(**kwargs) -> bool:
    return send_event("CompletePayment", **kwargs)
