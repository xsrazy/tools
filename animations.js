/* Small progressive enhancements for Finance Calculators.
   Loaded AFTER site.js. Never touches calculator math; only animates
   the hero result numbers and toggles the mobile nav. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Mobile nav toggle ---------- */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    window.addEventListener("scroll", function () {
      if (links.classList.contains("open")) {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    }, { passive: true });
    document.addEventListener("click", function (e) {
      if (links.classList.contains("open") &&
          !links.contains(e.target) && !toggle.contains(e.target)) {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Count-up on big result numbers ----------
     site.js writes final text synchronously on every input event, which
     bubbles to document AFTER the element-level handlers ran, so by the
     time these listeners fire the DOM already holds the new value. */
  var IDS = ["m-total", "l-payment", "c-fv", "r-newpay"];

  function parseMoney(s) {
    var m = /^\$([\d,]+)(\.\d+)?$/.exec(String(s).trim());
    if (!m) return null;
    return {
      v: parseFloat((m[1] + (m[2] || "")).replace(/,/g, "")),
      dec: m[2] ? m[2].length - 1 : 0
    };
  }
  function fmt(v, dec) {
    return "$" + v.toLocaleString("en-US", {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }

  var states = {};
  function animate(el) {
    var p = parseMoney(el.textContent);
    if (!p || !window.requestAnimationFrame) {
      return;
    }
    var st = states[el.id] || (states[el.id] = { shown: 0, raf: 0 });
    if (st.raf) cancelAnimationFrame(st.raf);
    var from = st.shown, to = p.v, dec = p.dec;
    if (reduceMotion || Math.abs(to - from) < 0.005) {
      el.textContent = fmt(to, dec);
      st.shown = to;
      return;
    }
    var start = 0, dur = 450;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var v = from + (to - from) * e;
      el.textContent = fmt(v, dec);
      st.shown = v;
      if (t < 1) {
        st.raf = requestAnimationFrame(step);
      } else {
        el.textContent = fmt(to, dec);
        st.shown = to;
        st.raf = 0;
      }
    }
    st.raf = requestAnimationFrame(step);
  }
  function animateAll() {
    for (var i = 0; i < IDS.length; i++) {
      var el = document.getElementById(IDS[i]);
      if (el) animate(el);
    }
  }

  ["input", "change", "click"].forEach(function (ev) {
    document.addEventListener(ev, animateAll, false);
  });
  window.addEventListener("load", animateAll);

  /* ---------- Exclusive FAQ accordion ----------
     Opening one question closes the others in the same FAQ block. */
  document.querySelectorAll(".faq details").forEach(function (det) {
    det.addEventListener("toggle", function () {
      if (!det.open) return;
      var scope = det.closest(".faq") || document;
      scope.querySelectorAll("details[open]").forEach(function (other) {
        if (other !== det) other.open = false;
      });
    });
  });
})();

/* ---------- Integer count-up for [data-countup] stats ----------
   Same bubbling trick as the money version: site.js writes the final
   text synchronously on input, this listener fires after and animates
   from the previously shown value to the new one. */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var states = {};
  function parseNumVal(s) {
    var str = String(s).replace(/[^0-9.]/g, "");
    if (!str) return null;
    var n = parseFloat(str);
    if (isNaN(n)) return null;
    return { v: n, dec: (str.split(".")[1] || "").length };
  }
  function fmtNum(v, dec) {
    return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function animateInt(el) {
    if (!el.id) return;
    var p = parseNumVal(el.textContent);
    if (!p || !window.requestAnimationFrame) return;
    var st = states[el.id] || (states[el.id] = { shown: 0, raf: 0 });
    if (st.raf) cancelAnimationFrame(st.raf);
    var from = st.shown, to = p.v, dec = p.dec;
    if (reduceMotion || from === to) {
      el.textContent = fmtNum(to, dec);
      st.shown = to;
      return;
    }
    var start = 0, dur = 350;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var v = from + (to - from) * e;
      if (dec === 0) v = Math.round(v);
      el.textContent = fmtNum(v, dec);
      st.shown = v;
      if (t < 1) { st.raf = requestAnimationFrame(step); }
      else { el.textContent = fmtNum(to, dec); st.shown = to; st.raf = 0; }
    }
    st.raf = requestAnimationFrame(step);
  }
  function animateAllInt() {
    document.querySelectorAll("[data-countup]").forEach(animateInt);
  }
  ["input", "change", "click"].forEach(function (ev) {
    document.addEventListener(ev, animateAllInt, false);
  });
  window.addEventListener("load", animateAllInt);
})();
