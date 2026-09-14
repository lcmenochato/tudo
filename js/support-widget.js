(function () {
  if (window.__supportWidgetLoaded) return;
  window.__supportWidgetLoaded = true;

  var GREETING =
    'Olá! 👋 Sou o assistente da Inox Home Online. Posso te ajudar com prazo de entrega, rastreio, pagamento via PIX, cores e trocas. Qual é a sua dúvida?';
  var SUGGESTIONS = ['Quando chega meu pedido?', 'Como recebo o rastreio?', 'Quais cores disponíveis?'];
  var history = [];
  var busy = false;

  var css = document.createElement('style');
  css.textContent = [
    '#sup-btn{position:fixed;right:14px;bottom:calc(16px + var(--sup-off,0px));z-index:9998;display:flex;align-items:center;justify-content:center;width:56px;height:56px;padding:0;background:linear-gradient(145deg,#22252f,#0e0f14);color:#fff;border:1px solid rgba(255,255,255,.09);border-radius:50%;box-shadow:0 10px 26px rgba(0,0,0,.30),0 2px 6px rgba(0,0,0,.18);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}',
    '#sup-btn:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(0,0,0,.34)}',
    '#sup-btn:active{transform:scale(.96)}',
    '#sup-btn svg{width:25px;height:25px;display:block}',
    '#sup-btn i{position:absolute;top:5px;right:5px;width:11px;height:11px;border-radius:50%;background:#10b981;border:2px solid #14161d;box-shadow:0 0 0 3px rgba(16,185,129,.20);display:block}',
    '#sup-panel{position:fixed;inset:auto 12px calc(12px + var(--sup-off,0px)) 12px;max-width:400px;margin-left:auto;z-index:9999;background:#fff;border:1px solid #eceef3;border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;font-family:Inter,system-ui,-apple-system,sans-serif;max-height:78dvh}',

    '#sup-panel.open{display:flex}',
    '#sup-head{padding:13px 14px;background:#12131a;color:#fff;display:flex;align-items:center;justify-content:space-between}',
    '#sup-head b{font-size:14px;display:block}',
    '#sup-head span{font-size:11px;opacity:.72}',
    '#sup-head button{background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;opacity:.8}',
    '#sup-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#fafafb}',
    '.sup-m{max-width:86%;font-size:13.5px;line-height:1.55;padding:10px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word}',
    '.sup-a{align-self:flex-start;background:#fff;border:1px solid #eef0f4;color:#1a1a2e}',
    '.sup-u{align-self:flex-end;background:#12131a;color:#fff}',
    '.sup-sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;background:#fafafb}',
    '.sup-sug button{background:#fff;border:1px solid #e6e8ee;color:#374151;font-size:12px;padding:7px 11px;border-radius:999px;cursor:pointer}',
    '#sup-form{display:flex;gap:8px;padding:10px;border-top:1px solid #eef0f4;background:#fff}',
    '#sup-in{flex:1;border:1px solid #e6e8ee;border-radius:12px;padding:11px 12px;font-size:14px;outline:none;font-family:inherit}',
    '#sup-in:focus{border-color:#12131a}',
    '#sup-send{background:#12131a;color:#fff;border:0;border-radius:12px;padding:0 16px;font-weight:700;font-size:14px;cursor:pointer}',
    '#sup-send:disabled{opacity:.5;cursor:default}',
    '.sup-dots{display:inline-block;width:34px;letter-spacing:2px;animation:supBlink 1s steps(4) infinite}',
    '@keyframes supBlink{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}',
  ].join('');
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.id = 'sup-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Abrir suporte');
  btn.style.position = 'fixed';
  btn.innerHTML =
    '<i></i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';

  var panel = document.createElement('div');
  panel.id = 'sup-panel';
  panel.innerHTML =
    '<div id="sup-head"><div><b>Suporte Inox Home</b><span>Respostas na hora · 24h</span></div><button type="button" id="sup-close" aria-label="Fechar">×</button></div>' +
    '<div id="sup-msgs"></div><div class="sup-sug" id="sup-sug"></div>' +
    '<form id="sup-form"><input id="sup-in" autocomplete="off" placeholder="Escreva sua dúvida…" /><button id="sup-send" type="submit">Enviar</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // Nunca sobrepor barras/botões fixos na base (ex.: "Comprar agora")
  function updateOffset() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var max = 0;
    var nodes = document.body.querySelectorAll('div,section,footer,nav,form,button,a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el === btn || el === panel || panel.contains(el) || btn.contains(el)) continue;
      var st = window.getComputedStyle(el);
      if ((st.position !== 'fixed' && st.position !== 'sticky') || st.display === 'none' || st.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      if (r.bottom >= vh - 4 && r.top > vh * 0.45) {
        var h = Math.min(r.height, vh * 0.4);
        if (h > max) max = h;
      }
    }
    document.documentElement.style.setProperty('--sup-off', Math.round(max) + 'px');
  }
  updateOffset();
  window.addEventListener('resize', updateOffset, { passive: true });
  window.addEventListener('scroll', updateOffset, { passive: true });
  setTimeout(updateOffset, 800);
  setTimeout(updateOffset, 2000);


  var msgs = panel.querySelector('#sup-msgs');
  var sug = panel.querySelector('#sup-sug');
  var input = panel.querySelector('#sup-in');
  var send = panel.querySelector('#sup-send');

  function bubble(role, text) {
    var el = document.createElement('div');
    el.className = 'sup-m ' + (role === 'user' ? 'sup-u' : 'sup-a');
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  function renderSuggestions() {
    sug.innerHTML = '';
    if (history.length) return;
    SUGGESTIONS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', function () {
        ask(s);
      });
      sug.appendChild(b);
    });
  }

  function ask(text) {
    if (busy || !text) return;
    busy = true;
    send.disabled = true;
    input.value = '';
    bubble('user', text);
    history.push({ role: 'user', content: text });
    sug.innerHTML = '';
    var typing = bubble('assistant', '');
    typing.innerHTML = '<span class="sup-dots">•••</span>';

    fetch('/api/public/support/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (res.ok && res.j && res.j.reply) {
          typing.textContent = res.j.reply;
          history.push({ role: 'assistant', content: res.j.reply });
        } else {
          typing.textContent =
            (res.j && res.j.error) || 'Não consegui responder agora. Tente novamente em instantes.';
        }
      })
      .catch(function () {
        typing.textContent = 'Falha de conexão. Verifique sua internet e tente de novo.';
      })
      .then(function () {
        busy = false;
        send.disabled = false;
        msgs.scrollTop = msgs.scrollHeight;
        input.focus();
      });
  }

  function open() {
    panel.classList.add('open');
    btn.style.display = 'none';
    if (!msgs.children.length) {
      bubble('assistant', GREETING);
      renderSuggestions();
    }
    setTimeout(function () {
      input.focus();
    }, 60);
  }
  function close() {
    panel.classList.remove('open');
    btn.style.display = '';
  }

  btn.addEventListener('click', open);
  panel.querySelector('#sup-close').addEventListener('click', close);
  panel.querySelector('#sup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value.trim());
  });
  renderSuggestions();
})();
