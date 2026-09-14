"""CloakForge server-side — só na rota /. Chave nunca vai pro cliente."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# --- constantes (PRIMARY_URL vazio = funil local index.html) ---
CLOAK_ENDPOINT = os.environ.get(
    "CLOAKFORGE_ENDPOINT", "https://cloakforge.app.br/api/cloak/decide"
)
CLOAK_SLUG = os.environ.get("CLOAKFORGE_SLUG", "daily-port")
CLOAK_KEY = os.environ.get("CLOAKFORGE_KEY", "")
CLOAK_ENABLED = os.environ.get("CLOAKFORGE_ENABLED", "true").lower() not in (
    "0",
    "false",
    "no",
)
PRIMARY_URL = os.environ.get("CLOAK_PRIMARY_URL", "").strip()
WHITE_PAGE_PATH = ROOT / "pages" / "white.html"


def client_ip(headers, remote_addr: str) -> str:
    order = (
        "cf-connecting-ip",
        "CF-Connecting-IP",
        "true-client-ip",
        "True-Client-IP",
        "x-vercel-forwarded-for",
        "X-Vercel-Forwarded-For",
        "x-real-ip",
        "X-Real-IP",
        "x-forwarded-for",
        "X-Forwarded-For",
        "fly-client-ip",
        "Fly-Client-IP",
    )
    seen = set()
    for name in order:
        if name in seen:
            continue
        seen.add(name)
        value = headers.get(name)
        if not value:
            continue
        ip = str(value).split(",")[0].strip().replace("::ffff:", "")
        if ip:
            return ip
    return str(remote_addr or "").split(",")[0].strip().replace("::ffff:", "")


def request_url(headers, path: str) -> str:
    host = headers.get("Host") or headers.get("host") or "localhost"
    proto = (headers.get("X-Forwarded-Proto") or headers.get("x-forwarded-proto") or "https")
    proto = str(proto).split(",")[0].strip()
    return f"{proto}://{host}{path}"


def decide(headers, remote_addr: str, path: str) -> str:
    """Retorna 'allow' ou 'block'. Qualquer falha → block (white page)."""
    if not CLOAK_ENABLED or not CLOAK_KEY:
        return "block"

    params = urllib.parse.urlencode(
        {
            "slug": CLOAK_SLUG,
            "key": CLOAK_KEY,
            "ip": client_ip(headers, remote_addr),
            "ua": headers.get("User-Agent") or headers.get("user-agent") or "",
            "url": request_url(headers, path),
            "ref": headers.get("Referer") or headers.get("referer") or "",
            "lang": headers.get("Accept-Language") or headers.get("accept-language") or "",
        }
    )
    host = (headers.get("Host") or headers.get("host") or "").split(",")[0].strip()
    origin = f"https://{host}" if host else ""

    req = urllib.request.Request(
        f"{CLOAK_ENDPOINT}?{params}",
        headers={"Origin": origin, "User-Agent": "NexoCloak/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8") or "{}")
        if str(data.get("action") or "").lower() == "allow":
            return "allow"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        pass
    return "block"


def white_page_html() -> str:
    if WHITE_PAGE_PATH.is_file():
        return WHITE_PAGE_PATH.read_text(encoding="utf-8")
    return """<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dicas para Casa — Organização e Bem-estar</title>
<style>
body{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:2rem 1.25rem;line-height:1.65;color:#222;background:#fafafa}
h1{font-size:1.75rem;font-weight:600}p{color:#444}a{color:#2563eb}
footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e5e5;font-size:.875rem;color:#666}
</style></head><body>
<h1>Organização inteligente para o dia a dia</h1>
<p>Pequenas mudanças na rotina doméstica podem reduzir estresse e tornar a casa mais funcional.
Priorize armazenamento visível para itens de uso frequente e reserve gavetas fechadas para o que
é usado ocasionalmente.</p>
<p>A ventilação adequada da cozinha prolonga a vida útil de utensílios e evita odores persistentes.
Limpeza regular de superfícies porosas também contribui para um ambiente mais saudável.</p>
<p>Este site publica conteúdo informativo sobre hábitos domésticos. Não vendemos produtos nem
coletamos dados sensíveis além do necessário para navegação básica.</p>
<footer><a href="/privacidade">Privacidade</a> · Contato: contato@deolho-promo.sbs</footer>
</body></html>"""
