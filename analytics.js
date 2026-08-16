/* GA4 event helpers beyond the basic pageview + project_click — scroll
   depth on the main page, which section/panel is actually being viewed,
   and scroll depth INSIDE the PDF modal (are people actually reading the
   whole case study or bailing early). Plain global script (not a
   module) so flip.js/pdf-viewer.js can call the exported functions
   without any import wiring. Everything no-ops if gtag isn't there
   (blocked/failed to load) instead of throwing. */
(function () {
  "use strict";
  if (typeof gtag !== 'function') return;

  /* ---------------------------------------------------------------
     Page-level scroll depth — 25/50/75/100% of the whole document,
     each fired once per page load. */
  var PAGE_THRESHOLDS = [25, 50, 75, 100];
  var pageSeen = {};
  function checkPageScroll() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    var pct = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    PAGE_THRESHOLDS.forEach(function (t) {
      if (pct >= t && !pageSeen[t]) {
        pageSeen[t] = true;
        gtag('event', 'scroll_depth', { percent_scrolled: t });
      }
    });
  }
  window.addEventListener('scroll', checkPageScroll, { passive: true });
  window.addEventListener('load', checkPageScroll);

  /* ---------------------------------------------------------------
     Section/panel views — which part of the one-page site someone
     actually reaches. flip.js calls this whenever a panel becomes the
     active one (desktop flip transition settling, or mobile/vertical
     scroll crossing into it) — see the __trackSectionView calls there. */
  var SECTION_NAMES = {
    'panel-1': 'Home',
    'panel-2': 'Selected Work',
    'panel-3': 'About',
    'panel-4': 'Journey',
    'panel-5': 'Contact'
  };
  window.__trackSectionView = function (panelId) {
    gtag('event', 'section_view', { section_name: SECTION_NAMES[panelId] || panelId });
  };

  /* ---------------------------------------------------------------
     PDF modal scroll depth — 25/50/75/100% of that specific case
     study's own scrollable content, so "100" means they scrolled all
     the way through it. Thresholds reset per open (see
     __resetPdfScrollDepth, called from pdf-viewer.js's loadPdf) so
     reopening a project or switching to another one gets its own
     fresh read rather than being stuck "already seen". */
  var PDF_THRESHOLDS = [25, 50, 75, 100];
  var pdfSeen = {};
  window.__resetPdfScrollDepth = function () { pdfSeen = {}; };
  window.__trackPdfScroll = function (viewportEl, projectName) {
    var scrollable = viewportEl.scrollHeight - viewportEl.clientHeight;
    if (scrollable <= 0) return;
    var pct = Math.min(100, Math.round((viewportEl.scrollTop / scrollable) * 100));
    PDF_THRESHOLDS.forEach(function (t) {
      if (pct >= t && !pdfSeen[t]) {
        pdfSeen[t] = true;
        gtag('event', 'pdf_scroll_depth', { project_name: projectName, percent_scrolled: t });
      }
    });
  };
})();
