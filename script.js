(function () {
  var root = document.documentElement;
  var DESIGN_W = 1726;
  var DESIGN_H = 996;

  function fit() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var scale = Math.max(vw / DESIGN_W, vh / DESIGN_H);
    root.style.setProperty('--stage-scale', scale);
  }

  fit();
  window.addEventListener('resize', fit);
})();

/* Mobile hero's "scroll to continue" cue (the green sphere + arrow) —
   clicking/tapping it scrolls straight to Selected Work, same
   window.scrollTo pattern the vertical nav dots already use on mobile
   (see wireVerticalDots() in flip.js). Only meaningful on mobile (the
   button is display: none on desktop), but harmless to wire up
   unconditionally. */
(function () {
  var cue = document.getElementById('mobileScrollCue');
  var target = document.getElementById('panel-2');
  if (!cue || !target) return;
  cue.addEventListener('click', function () {
    window.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
  });
})();

/* Mobile-only nav: the top-right avatar+hamburger pill toggles the
   existing .dots nav open/closed as a dropdown (restyled for mobile in
   styles.css) — same 5 buttons, same scroll-to logic already wired up
   in flip.js, just presented differently. Closes itself after a link
   is tapped, on an outside click, or on Escape. */
(function () {
  var toggle = document.getElementById('mobileNavToggle');
  var nav = document.getElementById('navDots');
  if (!toggle || !nav) return;

  function close() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  function open() {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    if (nav.classList.contains('is-open')) close(); else open();
  });
  nav.querySelectorAll('.dot').forEach(function (dot) {
    dot.addEventListener('click', close);
  });
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();

(function () {
  var btn = document.querySelector('.p5-copy-btn');
  if (!btn) return;
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5L10 17.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var original = btn.innerHTML;

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(btn.dataset.copy).then(function () {
      btn.innerHTML = CHECK;
      btn.setAttribute('aria-label', 'Copied!');
      setTimeout(function () {
        btn.innerHTML = original;
        btn.setAttribute('aria-label', 'Copy email address');
      }, 1500);
    });
  });
})();

/* Case-study PDF viewer logic now lives in pdf-viewer.js (canvas/pdf.js
   based — replaced the old raw-iframe approach so mobile no longer has
   to bail out to window.open). */
