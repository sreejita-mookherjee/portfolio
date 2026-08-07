/* Case-study PDF viewer: renders a PDF's own pages via pdf.js onto
   <canvas> elements, so there's no dependency on the browser's native
   PDF plugin (the reason mobile Chrome couldn't show PDFs inline
   before — it has none). Same model on both breakpoints now: every
   slide stacked vertically inside a scrollable panel, native smooth
   scroll (+ scroll-snap) to move between them — desktop is just a
   smaller centered modal version of the same full-bleed mobile layout,
   not a separate one-slide-at-a-time pager anymore.

   Nothing here hard-codes a page count or slide index — pdf.numPages
   is read straight off whatever file is at data-pdf. Replacing that
   file (same filename, same path) is the entire update workflow: no
   HTML/JS edit needed to refresh a case study's content, only to add a
   brand-new project card. */
import * as pdfjsLib from './assets/vendor/pdf.min.mjs';

(function () {
  /* Guards against this module's own init logic running more than once
     against the same document — observed happening in testing (every
     step, from wiring click handlers to loading a file, fired exactly
     twice per page load) and it's a serious failure mode, not just
     redundant work: two independent PDFDocumentProxy loads/render
     chains contending for pdf.js's one shared worker is exactly the
     kind of overlap that produced the flipped/hung renders elsewhere
     in this file. `pdfjsLib` itself (the import) is already
     spec-guaranteed single-instance regardless, but this closure's own
     state/listeners are not, hence the explicit guard. */
  if (window.__pdfViewerInit) return;
  window.__pdfViewerInit = true;

  var overlay = document.getElementById('pdfOverlay');
  var viewport = document.getElementById('pdfOverlayViewport');
  var pagesWrap = document.getElementById('pdfOverlayPages');
  var closeBtn = document.getElementById('pdfOverlayClose');
  var titleEl = document.getElementById('pdfOverlayTitle');
  var pageCountEl = document.getElementById('pdfOverlayPageCount');
  var zoomInBtn = document.getElementById('pdfOverlayZoomIn');
  var zoomOutBtn = document.getElementById('pdfOverlayZoomOut');
  if (!overlay || !pagesWrap) return;

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.mjs';

  var pdfCards = Array.prototype.slice.call(document.querySelectorAll('.pcard[data-pdf]'));

  var state = {
    doc: null,          // current PDFDocumentProxy
    url: null,           // currently loaded file, so reopening the same card doesn't refetch
    numPages: 0,
    canvases: [],          // one <canvas> per page, rendered lazily
    isMobile: false,
    renderToken: 0,         // bumped on every open/close/resize to cancel stale in-flight renders
    pageObserver: null,     // drives the page-count pill off real scroll position
    lazyObserver: null,     // triggers each page's render as it nears the viewport
    visibleCanvases: [],    // canvases the lazy observer currently considers near/in view — used to re-render the right ones on zoom/resize
    renderQueue: [],        // pending {canvas, idx} pairs, drained one at a time
    queueRunning: false,
    zoom: 1                 // manual in-app zoom — see setZoom()
  };
  var ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.25;

  function isMobileViewport() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function clearPages() {
    if (state.pageObserver) { state.pageObserver.disconnect(); state.pageObserver = null; }
    if (state.lazyObserver) { state.lazyObserver.disconnect(); state.lazyObserver = null; }
    state.visibleCanvases = [];
    state.renderQueue = [];
    state.queueRunning = false;
    pagesWrap.innerHTML = '';
    state.canvases = [];
  }

  /* Renders one page at a resolution matched to how big it'll actually
     display × devicePixelRatio, fit to the panel's width (every slide
     scrolls past at that same width now, there's no single "whole
     slide must fit on screen" case anymore). Extra headroom beyond
     plain DPR — a canvas is a fixed raster, so without that margin a
     pinch/ctrl-scroll zoom-in immediately pixelates; mobile gets more
     of it since a phone is pinch-zoomed far more often than a laptop. */
  var ZOOM_HEADROOM = { mobile: 2.2, desktop: 1.5 };
  function renderPage(pdf, num, canvas, myToken) {
    return pdf.getPage(num).then(function (page) {
      if (myToken !== state.renderToken) return;
      var baseViewport = page.getViewport({ scale: 1 });
      var padding = state.isMobile ? 24 : 32;
      var availW = Math.max(100, viewport.clientWidth - padding) * state.zoom;
      var scale = availW / baseViewport.width;
      var dpr = window.devicePixelRatio || 1;
      var headroom = state.isMobile ? ZOOM_HEADROOM.mobile : ZOOM_HEADROOM.desktop;
      var displayViewport = page.getViewport({ scale: scale });
      var renderViewport = page.getViewport({ scale: scale * dpr * headroom });
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = Math.floor(displayViewport.width) + 'px';
      canvas.style.height = Math.floor(displayViewport.height) + 'px';
      var ctx = canvas.getContext('2d');
      return page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
    });
  }

  /* Renders queued canvases ONE AT A TIME, in FIFO order — firing them
     all concurrently (Promise.all-style) hit a real pdf.js render-task
     race (documented upstream: overlapping render calls against the
     same PDFDocumentProxy can hand back a page upside-down/mis-scaled).
     Confirmed here empirically: rendering several pages of this exact
     deck at once produced a flipped page; one at a time never did.

     Each page is also raced against a timeout — pdf.js's render() can,
     separately and rarely, just never settle (confirmed here too, same
     as the warm-up's version of this problem). Without a timeout, one
     stuck page would permanently block every page queued after it,
     not just itself. Racing means a stuck page just stays blank on its
     own; everything queued after it still gets its turn.

     What gets INTO this queue is driven by wireLazyRender() below, not
     "every page, immediately" — see that function for why. */
  var RENDER_TIMEOUT_MS = 4000;
  function queueRender(canvas, idx) {
    if (canvas.dataset.queued) return canvas.__renderPromise || Promise.resolve();
    canvas.dataset.queued = '1';
    var p = new Promise(function (resolve) {
      state.renderQueue.push({ canvas: canvas, idx: idx, token: state.renderToken, resolve: resolve });
    });
    canvas.__renderPromise = p;
    pumpQueue();
    return p;
  }
  function pumpQueue() {
    if (state.queueRunning) return;
    var item = state.renderQueue.shift();
    if (!item) return;
    state.queueRunning = true;
    if (item.token !== state.renderToken) { state.queueRunning = false; item.resolve(); pumpQueue(); return; }
    var timeout = new Promise(function (resolve) { setTimeout(resolve, RENDER_TIMEOUT_MS); });
    Promise.race([renderPage(state.doc, item.idx + 1, item.canvas, item.token), timeout]).then(function () {
      item.canvas.dataset.rendered = '1';
      state.queueRunning = false;
      item.resolve();
      pumpQueue();
    });
  }

  /* the page-count pill reflects whatever slide is actually most in
     view as the user scrolls, rather than a button-driven counter —
     there's no more discrete "current page" the app controls. Wired
     right after the canvases exist (in buildPages), independent of
     whether anything has actually rendered yet — an IntersectionObserver
     only needs layout geometry, not finished pixels, and gating it
     behind render completion turned out to be fragile (observed going
     silently stale under rapid close/reopen — the pill just never
     appeared, even though every canvas had in fact rendered fine). */
  function wireScrollSpy() {
    pageCountEl.hidden = state.numPages <= 1;
    if (state.numPages <= 1 || !state.canvases.length) return;
    state.pageObserver = new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (e) {
        if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) best = e;
      });
      if (best) {
        var idx = state.canvases.indexOf(best.target);
        if (idx >= 0) pageCountEl.textContent = (idx + 1) + ' / ' + state.numPages;
      }
    }, { root: viewport, threshold: [0.5, 0.75, 1] });
    state.canvases.forEach(function (c) { state.pageObserver.observe(c); });
  }

  /* Renders each slide only as it's about to actually be seen, instead
     of firing all of them in one background burst the moment the file
     opens. That eager-burst approach had a real, confirmed failure
     mode: a canvas still off-screen can have its render work throttled
     by the browser, and then get abruptly resumed/rushed the moment a
     scroll brings it into view — that abrupt restart is exactly the
     kind of timing gap that trips pdf.js's render-race bug (reported
     live: the same slide flipped on scroll, repeatedly, and it was
     consistently the deck's heaviest slide — nearly 3x any other
     page's content). Rendering on approach instead of upfront means a
     page is never mid-render when a scroll suddenly brings it forward.
     rootMargin gives each page a head start (starts rendering ~60% of
     a viewport-height before it's actually visible) so it's normally
     already finished by the time it's on screen, without going back to
     "render everything immediately" and reintroducing the original bug. */
  function wireLazyRender() {
    if (state.lazyObserver) state.lazyObserver.disconnect();
    state.visibleCanvases = [];
    state.lazyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var idx = state.canvases.indexOf(e.target);
        if (idx < 0) return;
        if (e.isIntersecting) {
          if (state.visibleCanvases.indexOf(e.target) < 0) state.visibleCanvases.push(e.target);
          queueRender(e.target, idx);
        } else {
          var vi = state.visibleCanvases.indexOf(e.target);
          if (vi >= 0) state.visibleCanvases.splice(vi, 1);
        }
      });
    }, { root: viewport, rootMargin: '60% 0px' });
    state.canvases.forEach(function (c) { state.lazyObserver.observe(c); });
  }

  function layoutForBreakpoint() {
    state.isMobile = isMobileViewport();
    wireLazyRender();
    /* page 1 is always visible the instant the modal opens — no reason
       to wait on the observer's (async, next-frame) initial callback
       for the one page whose visibility was never actually in
       question. Rendering it directly here means it starts the moment
       the file is ready, not one round-trip later. */
    if (state.canvases[0]) queueRender(state.canvases[0], 0);
  }

  /* Desktop-only manual zoom (mobile has native pinch-zoom instead — see
     the gesture-blocking note further down). Re-renders the actual PDF
     content at the new size rather than CSS-stretching the existing
     canvases, so it stays crisp at any step instead of just the first
     ZOOM_HEADROOM multiple. Keeps roughly the same scroll position
     (by ratio, not by pixel) across the resize so zooming in doesn't
     throw you back to the top of the deck. */
  function setZoom(next) {
    var clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (clamped === state.zoom) return;
    var scrollable = viewport.scrollHeight - viewport.clientHeight;
    var ratio = scrollable > 0 ? viewport.scrollTop / scrollable : 0;
    state.zoom = clamped;
    var myToken = state.renderToken;
    /* every page's scale changed, so every canvas needs a re-render
       eventually — but only re-render the ones actually on screen right
       now immediately; the rest just fall back to unrendered and pick
       up the new zoom lazily via wireLazyRender() whenever they're
       next scrolled near, same as a first-time render. */
    var toRerenderNow = state.visibleCanvases.slice();
    state.canvases.forEach(function (c) { delete c.dataset.rendered; delete c.dataset.queued; });
    var waits = toRerenderNow.map(function (c) {
      var idx = state.canvases.indexOf(c);
      return idx >= 0 ? queueRender(c, idx) : Promise.resolve();
    });
    Promise.all(waits).then(function () {
      if (myToken !== state.renderToken) return;
      var newScrollable = viewport.scrollHeight - viewport.clientHeight;
      viewport.scrollTop = newScrollable * ratio;
    });
    if (zoomInBtn) zoomInBtn.disabled = state.zoom >= ZOOM_MAX;
    if (zoomOutBtn) zoomOutBtn.disabled = state.zoom <= ZOOM_MIN;
    viewport.classList.toggle('is-zoomed', state.zoom > 1);
  }

  /* Hand tool: once zoomed in past 1x, a slide can be wider/taller than
     the viewport in both directions at once, and dragging to pan reads
     far more naturally than hunting for scrollbars — the standard
     "grab" interaction real PDF/image viewers use when zoomed. Only
     active while state.zoom > 1 (the is-zoomed class, toggled in
     setZoom, is what actually shows the grab cursor — see the CSS). */
  var panState = null;
  viewport.addEventListener('mousedown', function (e) {
    if (state.isMobile || state.zoom <= 1) return;
    panState = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.classList.add('is-panning');
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!panState) return;
    viewport.scrollLeft = panState.left - (e.clientX - panState.x);
    viewport.scrollTop = panState.top - (e.clientY - panState.y);
  });
  window.addEventListener('mouseup', function () {
    if (!panState) return;
    panState = null;
    viewport.classList.remove('is-panning');
  });

  /* pdf.js has a real, upstream, timing-related bug where the very
     FIRST page render right after a document finishes loading can come
     out upside-down (confirmed here: reopening the exact same file a
     second time — same code, same page — always rendered correctly;
     only a fresh document load was ever affected). Rendering page 1
     once to a small throwaway offscreen canvas before ever touching a
     real, visible one reliably absorbs that race instead of it landing
     on-screen.
     BUT: pdf.js's render pipeline can also, separately and rarely,
     never settle a render call at all (confirmed here too — not just
     theoretical). A warm-up that can itself hang would make the whole
     viewer permanently stuck behind a blank modal, which is worse than
     the flip it's trying to prevent. Racing it against a short timeout
     means a normal warm-up (near-instant) still gets the benefit, and
     a stuck one just gets abandoned in the background — the real
     render proceeds either way, so the worst case reverts to "the flip
     bug can rarely still happen," not "the viewer can hang forever". */
  function warmUp(pdf) {
    var real = pdf.getPage(1).then(function (page) {
      var vp = page.getViewport({ scale: 0.2 });
      var warm = document.createElement('canvas');
      warm.width = Math.max(1, Math.ceil(vp.width));
      warm.height = Math.max(1, Math.ceil(vp.height));
      return page.render({ canvasContext: warm.getContext('2d'), viewport: vp }).promise;
    }).catch(function () { /* swallow — real rendering proceeds regardless */ });
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 800); });
    return Promise.race([real, timeout]);
  }

  function buildPages(pdf, myToken) {
    if (myToken !== state.renderToken) return;
    state.doc = pdf;
    state.numPages = pdf.numPages;
    clearPages();
    for (var i = 0; i < pdf.numPages; i++) {
      var c = document.createElement('canvas');
      c.className = 'pdf-overlay__page';
      pagesWrap.appendChild(c);
      state.canvases.push(c);
    }
    viewport.scrollTop = 0;
    wireScrollSpy();
    warmUp(pdf).then(function () {
      if (myToken !== state.renderToken) return;
      layoutForBreakpoint();
    });
  }

  function loadPdf(url, title) {
    state.renderToken++;
    var myToken = state.renderToken;
    state.zoom = 1;
    viewport.classList.remove('is-zoomed', 'is-panning');
    if (zoomInBtn) zoomInBtn.disabled = false;
    if (zoomOutBtn) zoomOutBtn.disabled = true;
    titleEl.textContent = title || '';
    clearPages();
    pageCountEl.textContent = '';
    pageCountEl.hidden = true;

    if (state.url === url && state.doc) {
      buildPages(state.doc, myToken);
      return;
    }
    state.url = url;
    state.doc = null;
    pdfjsLib.getDocument({ url: url }).promise.then(function (pdf) {
      if (myToken !== state.renderToken) return;
      buildPages(pdf, myToken);
    }).catch(function (err) {
      if (myToken !== state.renderToken) return;
      titleEl.textContent = (title ? title + ' — ' : '') + "couldn't load this file";
      console.error('PDF load failed:', err);
    });
  }

  var openedFromCard = null;
  function open(card) {
    var h3 = card.querySelector('h3');
    openedFromCard = card;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    loadPdf(card.dataset.pdf, h3 ? h3.textContent : '');
  }
  /* Returning to the exact card you opened — not just "wherever the
     page happens to have scrolled to" — matters most on mobile, where
     the card stack sits inside a very tall pinned/sticky section;
     losing your place there means scrolling back through everything to
     find it again. scrollIntoView on the actual card element (rather
     than restoring a saved pixel offset) stays correct even if
     something on the page reflowed while the modal was open. "instant"
     avoids a jarring animated scroll right as the modal itself is
     closing. */
  function close() {
    state.renderToken++; // cancels any render still in flight
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (openedFromCard) {
      openedFromCard.scrollIntoView({ block: 'center', behavior: 'instant' });
      openedFromCard = null;
    }
  }

  pdfCards.forEach(function (card) {
    card.addEventListener('click', function () { open(card); });
  });
  closeBtn.addEventListener('click', close);
  if (zoomInBtn) zoomInBtn.addEventListener('click', function () { setZoom(state.zoom + ZOOM_STEP); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { setZoom(state.zoom - ZOOM_STEP); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
  });
  /* Redirects the browser's own whole-PAGE zoom gesture into the in-app
     zoom control instead, on DESKTOP only — Chrome/Firefox report a
     trackpad pinch (or Ctrl+scroll) as a wheel event with ctrlKey true
     (a synthetic flag Chrome sets specifically for pinch, not an actual
     Ctrl keypress); desktop Safari fires WebKit-only gesture* events
     instead. Previously this just called preventDefault and did
     nothing else, which is exactly the "mouse zoom doesn't work"
     complaint — blocking the browser's zoom without substituting our
     own left the gesture feeling dead. Now it drives setZoom() instead,
     so the physical gesture people already reach for actually works.
     wheelZoomLocked debounces a single pinch/scroll gesture (which
     fires many small wheel events) down to one zoom step.
     Deliberately NOT applied on mobile: those same gesture* events are
     also how iOS Safari reports a genuine two-finger pinch on a
     touchscreen, and there's no separate signal to tell the two apart
     — blocking one blocks both, so mobile keeps native pinch-zoom
     instead (there's no custom in-app zoom control there the way
     desktop has). NOTE: this can't (and, by design, shouldn't) block
     zooming via an actual keyboard shortcut (Cmd/Ctrl +/-) — browsers
     deliberately keep that user-initiated path un-blockable by page JS
     for accessibility. */
  var wheelZoomLocked = false;
  overlay.addEventListener('wheel', function (e) {
    if (!e.ctrlKey || state.isMobile) return;
    e.preventDefault();
    if (wheelZoomLocked) return;
    wheelZoomLocked = true;
    setZoom(state.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    setTimeout(function () { wheelZoomLocked = false; }, 220);
  }, { passive: false });
  overlay.addEventListener('gesturestart', function (e) { if (!state.isMobile) e.preventDefault(); });
  overlay.addEventListener('gesturechange', function (e) { if (!state.isMobile) e.preventDefault(); });
  /* a resize (or a rotate on a real device) can cross the mobile
     breakpoint or just change how much room there is to fit a slide
     into — re-render whatever's currently visible at the new size
     rather than leaving stale-resolution canvases up. Re-wiring the
     lazy observer (inside layoutForBreakpoint) re-fires its initial
     callback for every currently-visible canvas, which is what
     actually re-queues them — nothing else needs to explicitly trigger
     a render here. */
  window.addEventListener('resize', function () {
    if (!overlay.classList.contains('is-open') || !state.doc) return;
    state.renderToken++;
    state.canvases.forEach(function (c) { delete c.dataset.rendered; delete c.dataset.queued; });
    layoutForBreakpoint();
  });
})();
