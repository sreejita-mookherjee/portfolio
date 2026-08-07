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

/* Case-study PDF viewer: click a project card that has a data-pdf
   (only the ones with an actual PDF supplied get one) to open the file
   itself — a centered modal on desktop, a full-bleed "page" on mobile,
   same markup/JS for both, styles.css just repositions it. Only opens
   from the front-most/focused card so an in-progress swipe never
   triggers it. */
(function () {
  var overlay = document.getElementById('pdfOverlay');
  var frame = document.getElementById('pdfOverlayFrame');
  var closeBtn = document.getElementById('pdfOverlayClose');
  var titleEl = document.getElementById('pdfOverlayTitle');
  var prevBtn = document.getElementById('pdfOverlayPrev');
  var nextBtn = document.getElementById('pdfOverlayNext');
  if (!overlay || !frame || !closeBtn) return;

  /* every card with an actual PDF, in carousel order — prev/next on
     desktop cycles through this list so you can flip between projects
     without closing the modal. Only one entry today, but wired for
     however many get a data-pdf added later. */
  var pdfCards = Array.prototype.slice.call(document.querySelectorAll('.pcard[data-pdf]'));
  var currentIdx = -1;

  function showAt(idx) {
    var n = pdfCards.length;
    if (!n) return;
    currentIdx = ((idx % n) + n) % n;
    var card = pdfCards[currentIdx];
    var h3 = card.querySelector('h3');
    /* #toolbar=0&navpanes=0&scrollbar=0 is the standard PDF-open param
       set Chrome/Firefox's built-in viewer respects — strips the
       download/print/annotate/rotate toolbar and the thumbnail side
       panel, leaving just the page content to scroll through. */
    frame.src = card.dataset.pdf + '#toolbar=0&navpanes=0&scrollbar=0';
    if (titleEl) titleEl.textContent = h3 ? h3.textContent : '';
    if (prevBtn) prevBtn.hidden = n <= 1;
    if (nextBtn) nextBtn.hidden = n <= 1;
  }
  function open(idx) {
    showAt(idx);
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    overlay.classList.remove('is-open');
    frame.src = '';
    document.body.style.overflow = '';
  }

  pdfCards.forEach(function (card, idx) {
    card.addEventListener('click', function () {
      var mobile = window.matchMedia('(max-width: 860px)').matches;
      /* the is-focus gate only matters on desktop, to stop a click
         landing on a background/side card mid-hover-fan. Mobile cards
         are a plain scrolling stack now (see styles.css/carousel.js —
         the old touch-swipe carousel that set is-focus is gone), so
         every mobile card is equally "current" and tappable; gating on
         a class that's never set there would silently break every tap. */
      if (!mobile && !card.classList.contains('is-focus')) return;
      /* Chrome on Android (and some other mobile browsers) doesn't
         render PDFs inline inside an <iframe> the way desktop
         Chrome/Firefox/Safari do — it just shows a bare "poc.pdf ·
         Open" download card instead of the actual pages. Rather than
         show that broken-looking placeholder inside our nice modal,
         skip the modal on mobile entirely and open the PDF directly in
         a new tab, where the browser's own full-page PDF viewer (which
         DOES work) takes over. */
      if (mobile) {
        window.open(card.dataset.pdf, '_blank');
        return;
      }
      open(idx);
    });
  });
  closeBtn.addEventListener('click', close);
  if (prevBtn) prevBtn.addEventListener('click', function () { showAt(currentIdx - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { showAt(currentIdx + 1); });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && prevBtn && !prevBtn.hidden) showAt(currentIdx - 1);
    else if (e.key === 'ArrowRight' && nextBtn && !nextBtn.hidden) showAt(currentIdx + 1);
  });
})();
