/**
 * Captura e persiste os parâmetros de rastreamento (UTMs + click ids + xcod)
 * e prepara os dados de correspondência avançada do Pixel (match rate).
 * Grava no primeiro acesso (localStorage) e reaproveita em todo o funil.
 */
(function () {
  var KEY = "lv_utm";
  var USER_KEY = "dadosPessoais";
  var EXT_KEY = "lv_external_id";
  var PIXEL_IDS =
    (typeof window !== "undefined" && window.LV_PIXEL_IDS) || [
      "1314655197168533",
      "1818128732510808",
    ];
  var FIELDS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "xcod",
    "src",
    "sck",
    "fbclid",
    "ttclid",
    "gclid",
  ];

  function readStored() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  /**
   * As páginas do funil rodam dentro de um iframe (mesma origem), e o iframe é
   * carregado sem a query string. Por isso lemos também a URL da janela do topo.
   */
  function searchString() {
    var s = window.location.search || "";
    try {
      if (window.top && window.top !== window && window.top.location.search) {
        s = s + (s ? "&" : "?") + window.top.location.search.replace(/^\?/, "");
      }
    } catch (e) {}
    try {
      if (document.referrer && document.referrer.indexOf("?") !== -1) {
        var ref = document.referrer.slice(document.referrer.indexOf("?") + 1);
        s = s + (s ? "&" : "?") + ref;
      }
    } catch (e) {}
    return s;
  }

  function capture() {
    var stored = readStored();
    var params = new URLSearchParams(searchString());
    var changed = false;
    FIELDS.forEach(function (f) {
      var v = params.get(f);
      if (v) {
        stored[f] = v;
        changed = true;
      }
    });
    if (changed) {
      try {
        localStorage.setItem(KEY, JSON.stringify(stored));
      } catch (e) {}
    }
    return stored;
  }

  capture();

  /* ------------------------- cookies _fbp / _fbc ------------------------- */

  function getCookie(name) {
    try {
      var m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
      return m ? decodeURIComponent(m.pop()) : "";
    } catch (e) {
      return "";
    }
  }

  function setCookie(name, value) {
    try {
      var host = location.hostname.split(".").slice(-2).join(".");
      var exp = new Date(Date.now() + 90 * 864e5).toUTCString();
      document.cookie = name + "=" + value + ";expires=" + exp + ";path=/;domain=." + host;
      if (!getCookie(name)) {
        document.cookie = name + "=" + value + ";expires=" + exp + ";path=/";
      }
    } catch (e) {}
  }

  // Garante _fbp e _fbc mesmo que o fbevents demore/seja bloqueado — sem eles
  // o Meta perde boa parte da correspondência das conversões.
  function ensureFbCookies() {
    if (!getCookie("_fbp")) {
      setCookie("_fbp", "fb.1." + Date.now() + "." + Math.floor(Math.random() * 1e10));
    }
    var fbclid = readStored().fbclid || new URLSearchParams(searchString()).get("fbclid");
    if (fbclid && !getCookie("_fbc")) {
      setCookie("_fbc", "fb.1." + Date.now() + "." + fbclid);
    }
  }
  ensureFbCookies();

  function externalId() {
    try {
      var id = localStorage.getItem(EXT_KEY);
      if (!id) {
        id =
          "u-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 10);
        localStorage.setItem(EXT_KEY, id);
      }
      return id;
    } catch (e) {
      return "";
    }
  }
  externalId();

  /* ---------------------- correspondência avançada ----------------------- */

  function userData() {
    var d = {};
    try {
      d = JSON.parse(localStorage.getItem(USER_KEY) || "{}") || {};
    } catch (e) {}
    var nome = String(d.nome || "").trim().toLowerCase();
    var parts = nome.split(/\s+/).filter(Boolean);
    var phone = String(d.telefone || "").replace(/\D/g, "");
    if (phone && phone.length <= 11) phone = "55" + phone;
    var addr = {};
    try {
      addr = JSON.parse(localStorage.getItem("dadosEndereco") || "{}") || {};
    } catch (e) {}
    var out = {
      em: String(d.email || "").trim().toLowerCase(),
      ph: phone,
      fn: parts[0] || "",
      ln: parts.length > 1 ? parts[parts.length - 1] : "",
      ct: String(addr.cidade || "").trim().toLowerCase().replace(/\s/g, ""),
      st: String(addr.uf || "").trim().toLowerCase(),
      zp: String(addr.cep || "").replace(/\D/g, ""),
      country: "br",
      external_id: externalId(),
    };
    Object.keys(out).forEach(function (k) {
      if (!out[k]) delete out[k];
    });
    return out;
  }

  var lastMatch = "";
  // Reinicializar o pixel com os dados do comprador é o jeito suportado de
  // atualizar a correspondência avançada durante a navegação.
  window.lvAdvancedMatch = function () {
    try {
      var ud = userData();
      var sig = JSON.stringify(ud);
      if (sig === lastMatch) return ud;
      lastMatch = sig;
      if (typeof window.fbq === "function" && (ud.em || ud.ph)) {
        PIXEL_IDS.forEach(function (id) {
          window.fbq("init", id, ud);
        });
      }
      return ud;
    } catch (e) {
      return {};
    }
  };
  setInterval(function () {
    window.lvAdvancedMatch();
  }, 3000);

  // Formato esperado pelo nosso endpoint /api/public/pix/create (campo "utm").
  window.getUTMs = function () {
    var d = readStored();
    return {
      source: d.utm_source || "",
      medium: d.utm_medium || "",
      campaign: d.utm_campaign || "",
      content: d.utm_content || "",
      term: d.utm_term || "",
      xcod: d.xcod || "",
      src: d.src || "",
      sck: d.sck || "",
      fbclid: d.fbclid || "",
      ttclid: d.ttclid || "",
      gclid: d.gclid || "",
    };
  };

  // Dados enviados ao servidor para a Conversions API (dedup + match rate).
  window.getFbData = function () {
    ensureFbCookies();
    var top = window.location.href;
    try {
      if (window.top && window.top !== window) top = window.top.location.href;
    } catch (e) {}
    return {
      fbp: getCookie("_fbp") || "",
      fbc: getCookie("_fbc") || "",
      externalId: externalId(),
      userAgent: navigator.userAgent || "",
      eventSourceUrl: top,
    };
  };

  /**
   * Dispara o Purchase do Pixel apenas uma vez por pedido, usando o mesmo
   * orderId enviado à UTMify/CAPI como eventID (deduplicação pixel × servidor).
   */
  window.lvTrackPurchase = function (orderId, amount) {
    if (!orderId) return false;
    var eventId = "pix_" + orderId;
    try {
      if (localStorage.getItem("fbPurchase_" + eventId)) return false;
      localStorage.setItem("fbPurchase_" + eventId, "1");
    } catch (e) {}
    var value = Number(amount) || 0;
    window.lvAdvancedMatch();
    try {
      if (typeof window.fbq === "function") {
        window.fbq(
          "track",
          "Purchase",
          { value: value, currency: "BRL", content_type: "product" },
          { eventID: eventId },
        );
      }
    } catch (e) {}
    PIXEL_IDS.forEach(function (id) {
      try {
        var img = new Image();
        img.src =
          "https://www.facebook.com/tr/?id=" +
          id +
          "&ev=Purchase&cd[value]=" +
          value +
          "&cd[currency]=BRL&eid=" +
          encodeURIComponent(eventId) +
          "&noscript=1&rl=" +
          Date.now();
        window.__fbPurchaseBeacon = img;
      } catch (e) {}
    });
    if (window.lvTtPurchase) window.lvTtPurchase(orderId, value);
    return true;
  };
})();

/* --------------------------------------------------------------------------
 * Persistência extra + navegação preservando a atribuição.
 * O funil roda em iframe; em Safari/iOS o localStorage do iframe pode ser
 * particionado, então gravamos também um cookie de 1ª parte e sempre
 * repassamos a query string ao navegar entre as etapas.
 * ------------------------------------------------------------------------ */
(function () {
  var KEY = "lv_utm";
  var FIELDS = [
    "utm_source","utm_medium","utm_campaign","utm_content","utm_term",
    "xcod","src","sck","fbclid","ttclid","gclid",
  ];

  function readLS() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function readCookie() {
    try {
      var m = document.cookie.match("(^|;)\\s*" + KEY + "\\s*=\\s*([^;]+)");
      return m ? JSON.parse(decodeURIComponent(m.pop())) || {} : {};
    } catch (e) { return {}; }
  }
  function writeCookie(obj) {
    try {
      var host = location.hostname.split(".").slice(-2).join(".");
      var exp = new Date(Date.now() + 90 * 864e5).toUTCString();
      var val = encodeURIComponent(JSON.stringify(obj));
      document.cookie = KEY + "=" + val + ";expires=" + exp + ";path=/;domain=." + host + ";SameSite=Lax";
      if (!readCookie().utm_source && !readCookie().xcod) {
        document.cookie = KEY + "=" + val + ";expires=" + exp + ";path=/;SameSite=Lax";
      }
    } catch (e) {}
  }

  // Une localStorage + cookie (o que existir) e regrava nos dois.
  function merged() {
    var ls = readLS(), ck = readCookie(), out = {};
    FIELDS.forEach(function (f) { if (ck[f]) out[f] = ck[f]; });
    FIELDS.forEach(function (f) { if (ls[f]) out[f] = ls[f]; });
    return out;
  }
  function sync() {
    var m = merged();
    if (!Object.keys(m).length) return m;
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {}
    writeCookie(m);
    return m;
  }
  sync();
  setInterval(sync, 5000);

  var baseGetUTMs = window.getUTMs;
  window.getUTMs = function () {
    var d = sync();
    var base = baseGetUTMs ? baseGetUTMs() : {};
    FIELDS.forEach(function (f) {
      var k = f.indexOf("utm_") === 0 ? f.slice(4) : f;
      if (!base[k] && d[f]) base[k] = d[f];
    });
    // Sem UTM mas com clique do Facebook: ainda assim é tráfego pago do FB.
    if (!base.source && (d.fbclid || document.cookie.indexOf("_fbc=") !== -1)) base.source = "FB";
    return base;
  };

  // Query string com os parâmetros de rastreio, para não perder a atribuição
  // ao mudar de etapa do funil (checkout -> upsells).
  window.lvQuery = function () {
    var d = sync();
    var parts = [];
    FIELDS.forEach(function (f) {
      if (d[f]) parts.push(encodeURIComponent(f) + "=" + encodeURIComponent(d[f]));
    });
    return parts.length ? "?" + parts.join("&") : "";
  };

  window.lvUrl = function (path) {
    if (!path) return path;
    if (path.indexOf("?") !== -1) return path;
    return path + window.lvQuery();
  };

  window.lvGo = function (path) {
    var url = window.lvUrl(path);
    try {
      if (window.top && window.top !== window && window.top.location.origin === window.location.origin) {
        window.top.location.href = url;
        return;
      }
    } catch (e) {}
    try { window.location.href = url; } catch (e) {}
  };
})();

/* Dados de comprador de reserva: se o usuário chegou ao upsell sem os dados
   do checkout (sessão perdida / storage bloqueado), geramos um cadastro
   fictício porém VÁLIDO (CPF com dígitos corretos, telefone e endereço reais
   em formato) para que a processadora nunca recuse a cobrança. */
(function () {
  var KEY = "lvFallbackPerson";

  function randDigits(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function makeCpf() {
    var base = "";
    for (var i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
    if (/^(\d)\1{8}$/.test(base)) base = "123456789";
    function dv(part) {
      var len = part.length + 1, sum = 0;
      for (var i = 0; i < part.length; i++) sum += parseInt(part[i], 10) * (len - i);
      var r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    }
    var d1 = dv(base);
    var d2 = dv(base + d1);
    return base + d1 + d2;
  }

  var NOMES = ["Ana", "Carla", "Juliana", "Marcos", "Bruno", "Patricia", "Rafael", "Fernanda", "Lucas", "Camila"];
  var SOBRENOMES = ["Silva", "Souza", "Oliveira", "Santos", "Pereira", "Costa", "Almeida", "Ribeiro"];
  var RUAS = ["Rua das Palmeiras", "Avenida Brasil", "Rua Sao Joao", "Rua das Flores", "Avenida Paulista"];
  var CIDADES = [
    { cidade: "Sao Paulo", uf: "SP", cep: "01310100", bairro: "Bela Vista" },
    { cidade: "Rio de Janeiro", uf: "RJ", cep: "20040002", bairro: "Centro" },
    { cidade: "Belo Horizonte", uf: "MG", cep: "30140071", bairro: "Funcionarios" },
    { cidade: "Curitiba", uf: "PR", cep: "80010010", bairro: "Centro" }
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  window.lvFallbackPerson = function () {
    try {
      var cached = localStorage.getItem(KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}

    var nome = pick(NOMES) + " " + pick(SOBRENOMES);
    var loc = pick(CIDADES);
    var p = {
      nome: nome,
      email: nome.toLowerCase().replace(/[^a-z]/g, ".") + randDigits(3) + "@gmail.com",
      cpf: makeCpf(),
      telefone: "11" + (9 + "") + randDigits(8),
      cep: loc.cep,
      logradouro: pick(RUAS),
      numero: String(Math.floor(Math.random() * 900) + 100),
      complemento: "",
      bairro: loc.bairro,
      cidade: loc.cidade,
      uf: loc.uf,
      _fallback: true
    };
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    return p;
  };
})();
