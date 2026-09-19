/**
 * TikTok Ads Pixel — espelha os eventos do Meta Pixel no funil.
 * Pixel ID: DALKOK3C77UC8FLKA4OG
 */
(function () {
  /* TikTok Pixel base */
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = (w[t] = w[t] || []);
    ttq.methods = [
      "page", "track", "identify", "instances", "debug", "on", "off", "once",
      "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent",
      "revokeConsent", "grantConsent",
    ];
    ttq.setAndDefer = function (t, e) {
      t[e] = function () {
        t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) {
      for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++)
        ttq.setAndDefer(e, ttq.methods[n]);
      return e;
    };
    ttq.load = function (e, n) {
      var r = "https://analytics.tiktok.com/i18n/pixel/events.js",
        o = n && n.partner;
      ttq._i = ttq._i || {};
      ttq._i[e] = [];
      ttq._i[e]._u = r;
      ttq._t = ttq._t || {};
      ttq._t[e] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[e] = n || {};
      n = document.createElement("script");
      n.type = "text/javascript";
      n.async = !0;
      n.src = r + "?sdkid=" + e + "&lib=" + t;
      e = document.getElementsByTagName("script")[0];
      e.parentNode.insertBefore(n, e);
    };
    ttq.load("DALKOK3C77UC8FLKA4OG");
    ttq.page();
  }(window, document, "ttq");

  var PRODUCT = {
    content_id: "kit-colinox-02",
    content_name: "Kit 10 Peças Colinox 02",
    content_type: "product",
  };

  function eventPayload(value) {
    return {
      contents: [PRODUCT],
      value: Number(value) || 0,
      currency: "BRL",
    };
  }

  window.lvTtPage = function () {
    try {
      if (typeof ttq !== "undefined") ttq.page();
    } catch (e) {}
  };

  window.lvTtInitiateCheckout = function (value) {
    try {
      if (typeof ttq !== "undefined")
        ttq.track("InitiateCheckout", eventPayload(value));
    } catch (e) {}
  };

  window.lvTtPurchase = function (orderId, amount) {
    if (!orderId) return false;
    var eventId = "pix_" + orderId;
    try {
      if (localStorage.getItem("ttPurchase_" + eventId)) return false;
      localStorage.setItem("ttPurchase_" + eventId, "1");
    } catch (e) {}
    var value = Number(amount) || 0;
    try {
      if (typeof ttq !== "undefined")
        ttq.track("CompletePayment", eventPayload(value), { event_id: eventId });
    } catch (e) {}
    return true;
  };

  window.lvTtIdentify = function () {
    try {
      var d = JSON.parse(localStorage.getItem("dadosPessoais") || "{}") || {};
      var ud = {};
      if (d.email) ud.email = String(d.email).trim().toLowerCase();
      if (d.telefone) {
        var ph = String(d.telefone).replace(/\D/g, "");
        if (ph && ph.length <= 11) ph = "55" + ph;
        ud.phone_number = ph;
      }
      if (Object.keys(ud).length && typeof ttq !== "undefined") ttq.identify(ud);
    } catch (e) {}
  };
  setInterval(window.lvTtIdentify, 3000);

  /* PageView em navegação SPA (wrappers index.html) */
  try {
    if (window === window.top) {
      var _lastTtPath = location.pathname;
      setInterval(function () {
        if (location.pathname !== _lastTtPath) {
          _lastTtPath = location.pathname;
          window.lvTtPage();
        }
      }, 600);
    }
  } catch (e) {}
})();
