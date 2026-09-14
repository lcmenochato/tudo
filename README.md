# Kit Colinox — Clone do Funil TikTok Shop

Clone fiel do funil [kitsdeculinaria.com](https://kitsdeculinaria.com/), espelhado sem refatoração do HTML/CSS/JS original.

## Fluxo

1. `/` — Página do produto (iframe → `site.html`)
2. Modal de cor → `/pagamento` — Checkout em 3 etapas + PIX
3. Após pagamento → `/upsell1` → `/upsell2` → `/upsell3` → `/upsell4`
4. `/obrigado` — Confirmação final

## Rodar localmente

```bash
python3 server.py
```

Abra [http://localhost:8080/](http://localhost:8080/)

Com credenciais Panda Pay no `.env`, o PIX é real. Sem credenciais, o mock auto-confirma em ~8s.

## Deploy na VPS (isolado)

Não mexe nos outros projetos: pasta própria (`/var/www/tiktokshop`), porta **8092**, PM2 `tiktokshop`, nginx vhost separado.

```bash
# 1) Subir código (só reinicia o PM2 tiktokshop)
bash deploy/upload.sh

# 2) Enviar secrets (.env local → VPS)
bash deploy/push-env.sh

# 3) Nginx + domínio (1x)
bash deploy/setup-nginx.sh seudominio.com

# 4) SSL (na VPS)
ssh root@80.78.28.126 'certbot --nginx -d seudominio.com -d www.seudominio.com'
```

Webhook Panda Pay: `https://seudominio.com/api/webhooks/pandapay`

Variáveis opcionais no upload: `VPS`, `REMOTE`, `APP_PORT`, `PM2_NAME`.

## Estrutura

- `index.html`, `site.html`, `pagamento.html`, `upsell*.html`, `obrigado.html` — páginas do funil
- `assets/`, `images/`, `css/`, `js/`, `__l5e/` — recursos estáticos originais
- `server.py` — servidor estático + endpoints `/api/public/pix/*`


### Panda Pay

A integração usa `Authorization: Bearer pp_live_...` no backend. Defina `PANDAPAY_API_KEY` com a chave secreta do painel da Panda Pay. Nunca publique a chave real no GitHub.
