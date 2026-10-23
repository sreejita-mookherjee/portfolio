(function () {
  "use strict";

  var hint = document.getElementById("scrollHint");
  if (!hint) return;

  var IDLE_MS = 3000;
  var timer = null;
  var onHomePage = true; // Home is the active page on load
   var held = window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)").matches;
   if (held) setTimeout(function () { if (held) { held = false; resetTimer(); } }, 15000);
  /* tells anyone listening (mini-me.js) when the hint appears/disappears */
  function announce(visible) {
    window.dispatchEvent(new CustomEvent("scrollhint", { detail: { visible: visible } }));
  }
  function show() { hint.classList.add("is-visible"); announce(true); }
  function hide() {
    if (!hint.classList.contains("is-visible")) return;
    hint.classList.remove("is-visible"); announce(false);
  }

  function resetTimer(delay) {
    hide();
    clearTimeout(timer);
    if (!onHomePage || held) return;
    timer = setTimeout(show, delay == null ? IDLE_MS : delay);
  }

  // Only real "trying to move on" gestures count — not idle mouse movement,
  // since the whole point is to nudge someone who hasn't scrolled at all.
  ["wheel", "touchmove", "keydown"].forEach(function (evt) {
    window.addEventListener(evt, function () { resetTimer(); }, { passive: true });
  });

  resetTimer();

  /* Hook wired from flip.js: only run/show the hint while Home (panel
     index 0) is the active page — on other pages, or in the flip layout
     where Home stays mounted just rotated out of view, it must stay
     hidden. In the mobile/no-flip fallback this hook is simply never
     called, which is fine: the hint is a normal child of panel-1 there,
     so it scrolls out of view with the rest of the panel automatically. */
  window.__scrollHintSetHome = function (isHome) {
    onHomePage = isHome;
    resetTimer();
  };

  /* Hooks for mini-me.js: hold the hint while her intro plays, then
     release it with a custom first delay (later idles use IDLE_MS). */
  window.__scrollHintHold = function () { held = true; resetTimer(); };
  window.__scrollHintRelease = function (delay) { held = false; resetTimer(delay); };
})();
