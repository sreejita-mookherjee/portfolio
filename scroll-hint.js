(function () {
  "use strict";

  var hint = document.getElementById("scrollHint");
  if (!hint) return;

  var IDLE_MS = 3000;
  var timer = null;
  var onHomePage = true; // Home is the active page on load

  function show() { hint.classList.add("is-visible"); }
  function hide() { hint.classList.remove("is-visible"); }

  function resetTimer() {
    hide();
    clearTimeout(timer);
    if (!onHomePage) return;
    timer = setTimeout(show, IDLE_MS);
  }

  // Only real "trying to move on" gestures count — not idle mouse movement,
  // since the whole point is to nudge someone who hasn't scrolled at all.
  ["wheel", "touchmove", "keydown"].forEach(function (evt) {
    window.addEventListener(evt, resetTimer, { passive: true });
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
})();
