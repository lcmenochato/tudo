# Deploy do site Tudo + FlevoPay no Cloudflare

Este repositório tem páginas estáticas e agora inclui um Worker que mantém os endpoints que o checkout já utiliza:
- `POST /api/public/pix/create`
- `GET /api/public/pix/status?id=...`
- `POST /api/webhooks/flevopay`

## 1. Configure a chave da FlevoPay

No painel Cloudflare, abra **Workers & Pages → seu Worker → Settings → Variables and Secrets** e crie o secret:

- Nome: `FLEVO_API_KEY`
- Valor: sua Secret Key da FlevoPay (não publique nem envie essa chave no chat).

Opcionalmente, crie a variável `FLEVO_WEBHOOK_URL` com a URL pública do Worker terminando em `/api/webhooks/flevopay`, por exemplo `https://SEU-WORKER.SEU-SUBDOMINIO.workers.dev/api/webhooks/flevopay`. Cadastre essa URL no painel da FlevoPay, se o painel oferecer configuração de postback.

## 2. Publicar o site e o Worker juntos (Wrangler)

Instale Node.js e Wrangler no computador:
```bash
npm install -g wrangler
wrangler login
```

Na pasta do repositório, publique:
```bash
wrangler deploy
```

O arquivo `wrangler.toml` configura o diretório do projeto como assets estáticos e envia as rotas `/api/*` primeiro para o Worker. Se você preferir fazer o deploy pelo painel Cloudflare, configure o Worker com o arquivo `worker.js` como entry point e configure os assets estáticos do repositório no binding `ASSETS`.

## 3. Testar com segurança

1. Abra a URL publicada e navegue até o checkout.
2. Gere um Pix com dados de teste válidos.
3. Confira se o checkout mostra o QR Code e o código copia-e-cola.
4. O status só será marcado como pago quando a consulta autenticada à FlevoPay retornar um status de aprovação.

## Observações

- Não existe modo mock/autoconfirmação neste Worker.
- O frontend atual envia o preço no navegador. Antes de usar em produção, os valores devem ser validados no servidor com uma tabela de preços confiável para impedir alterações manuais do valor pelo cliente.
- A API pública consultada documenta `GET /api/v1/query?action=get_transaction&id=...`; o Worker consulta esse endpoint para verificar o estado real.
- Nunca coloque `FLEVO_API_KEY` em arquivos HTML/JS, no GitHub ou em variáveis públicas do frontend.
