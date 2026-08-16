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
  var fullscreenBtn = document.getElementById('pdfOverlayFullscreen');
  var projPrevBtn = document.getElementById('pdfOverlayProjPrev');
  var projNextBtn = document.getElementById('pdfOverlayProjNext');
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
    renderQueue: [],        // pending {canvas, idx} pairs, drained one at a time
    queueRunning: false,
    zoom: 1,                // manual in-app zoom — see setZoom()
    videoObservers: []      // one per video-overlay slide, watching when it's actually on screen
  };
  var ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.25;

  /* A slide can have a real, playable video sitting exactly where a
     static mockup screenshot normally would — the PDF itself only ever
     carries the static image (pdf.js has no video-playback path at
     all), so this overlays a real <video> element on top of that one
     page, positioned as a % of the page's own dimensions so it tracks
     correctly at any zoom level or viewport width. bbox values come
     straight from the PDF's own embedded image placement (page.get_
     image_info() in PyMuPDF) for the static image the video replaces,
     converted to % of the page's point-size (1920x1080 here). Keyed by
     the same filename-derived slug used for GA4's project_name. */
  var VIDEO_OVERLAYS = {
    'hp-dashboard': {
      page: 5,
      src: 'assets/p2/hp-dashboard-transition.mp4',
      leftPct: 68.1293, topPct: 21.0574, widthPct: 14.9875, heightPct: 57.9778
    }
  };
  function pdfSlugFromUrl(url) {
    return url ? url.split('/').pop().split('?')[0].replace(/\.pdf$/i, '') : '';
  }
  function buildVideoOverlay(cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'pdf-overlay__page-wrap';
    var video = document.createElement('video');
    video.className = 'pdf-overlay__video';
    video.src = cfg.src;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.left = cfg.leftPct + '%';
    video.style.top = cfg.topPct + '%';
    video.style.width = cfg.widthPct + '%';
    video.style.height = cfg.heightPct + '%';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pdf-overlay__video-toggle';
    toggle.setAttribute('aria-label', 'Pause video');
    toggle.style.left = cfg.leftPct + '%';
    toggle.style.top = cfg.topPct + '%';
    toggle.style.width = cfg.widthPct + '%';
    toggle.style.height = cfg.heightPct + '%';
    var playIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    var pauseIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    function syncIcon() {
      toggle.innerHTML = '<span class="pdf-overlay__video-icon">' + (video.paused ? playIcon : pauseIcon) + '</span>';
      toggle.classList.toggle('is-paused', video.paused);
      toggle.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
    }
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (video.paused) video.play(); else video.pause();
    });
    video.addEventListener('play', syncIcon);
    video.addEventListener('pause', syncIcon);
    syncIcon();
    wrap.appendChild(video);
    wrap.appendChild(toggle);
    /* Only plays once the visitor has actually scrolled to this slide
       (not the moment the modal opens, even if this is buried several
       pages down) — and pauses again once they've scrolled past it,
       rather than quietly looping on forever off-screen. Re-triggers
       every time it re-enters view, same as the common "video plays
       while it's the one on screen" pattern. A manual pause via the
       toggle is only overridden by actually leaving and returning to
       view, not by anything else. */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) video.play().catch(function () { /* still fine — the play icon covers it */ });
        else video.pause();
      });
    }, { root: viewport, threshold: 0.5 });
    io.observe(wrap);
    state.videoObservers.push(io);
    return wrap;
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function clearPages() {
    if (state.pageObserver) { state.pageObserver.disconnect(); state.pageObserver = null; }
    if (state.lazyObserver) { state.lazyObserver.disconnect(); state.lazyObserver = null; }
    state.videoObservers.forEach(function (io) { io.disconnect(); });
    state.videoObservers = [];
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
  function renderPage(pdf, num, canvas, myToken, taskHolder) {
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
      /* keep the RenderTask itself (not just its .promise) so a caller
         racing this against a timeout can actually call .cancel() on a
         stuck one — releasing the canvas so a retry can reuse it instead
         of just abandoning it blank forever. See pumpQueue below. */
      var task = page.render({ canvasContext: ctx, viewport: renderViewport });
      if (taskHolder) taskHolder.task = task;
      return task.promise;
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
     stuck page would permanently block every page queued after it. On
     timeout the stuck RenderTask is explicitly .cancel()'d (releasing
     its claim on the canvas — pdf.js otherwise refuses a second
     render() on the same canvas while one's still "in progress") and
     given ONE retry on that same canvas before giving up for good. A
     plain race with no cancel — the earlier version of this — left a
     genuinely stuck page blank forever, with no chance to recover on
     retry.

     9s (not a smaller value) specifically because some pages are just
     legitimately heavy rather than actually stuck — a densely nested
     Figma export (component-doc slides with 30+ nested Form XObjects)
     was confirmed to genuinely finish given enough time, not hang
     forever, but needed longer than a few seconds. A truly stuck page
     still can't block the queue for more than 2x this either way.

     What gets INTO this queue is driven by wireLazyRender() below, not
     "every page, immediately" — see that function for why. */
  var RENDER_TIMEOUT_MS = 9000;
  var RENDER_MAX_ATTEMPTS = 2;
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
    runRenderAttempt(item, 1);
  }
  function runRenderAttempt(item, attempt) {
    var taskHolder = {};
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve('timeout'); }, RENDER_TIMEOUT_MS); });
    var real = renderPage(state.doc, item.idx + 1, item.canvas, item.token, taskHolder).then(function () { return 'done'; }, function () { return 'error'; });
    Promise.race([real, timeout]).then(function (which) {
      if (which === 'timeout') {
        if (taskHolder.task) { try { taskHolder.task.cancel(); } catch (e) { /* already settling on its own — fine either way */ } }
        if (attempt < RENDER_MAX_ATTEMPTS) { runRenderAttempt(item, attempt + 1); return; }
      }
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
    state.lazyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var idx = state.canvases.indexOf(e.target);
        if (idx >= 0) queueRender(e.target, idx);
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

  /* Shared zoom commit path — desktop's buttons/ctrl-wheel and mobile's
     pinch (see the touch handlers further down) both funnel into this.
     Re-renders the actual PDF content at the new size rather than
     CSS-stretching the existing canvases, so it stays crisp at any
     step instead of just the first ZOOM_HEADROOM multiple. Keeps
     roughly the same scroll position (by ratio, not by pixel) across
     the resize so zooming in doesn't throw you back to the top of the
     deck. */
  /* Computed directly via geometry rather than read off
     state.visibleCanvases (the IntersectionObserver-maintained list) —
     zoom can commit at any arbitrary moment mid-gesture, and querying
     actual bounding boxes needs no observer round-trip to be correct,
     so there's no dependency on the observer having already caught up
     right at that instant. */
  function getCurrentlyVisibleCanvases() {
    var vpRect = viewport.getBoundingClientRect();
    return state.canvases.filter(function (c) {
      var r = c.getBoundingClientRect();
      return r.bottom > vpRect.top && r.top < vpRect.bottom && r.right > vpRect.left && r.left < vpRect.right;
    });
  }
  function setZoom(next) {
    var clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (clamped === state.zoom) return;
    var scrollable = viewport.scrollHeight - viewport.clientHeight;
    var ratio = scrollable > 0 ? viewport.scrollTop / scrollable : 0;
    var zoomRatio = clamped / state.zoom;
    state.zoom = clamped;
    var myToken = state.renderToken;
    /* every page's scale changed, so every canvas needs a re-render
       eventually — but only re-render the ones actually on screen right
       now immediately; the rest just fall back to unrendered and pick
       up the new zoom lazily via wireLazyRender() whenever they're
       next scrolled near, same as a first-time render.
       That's fine for the BITMAP (a page you scroll to later can afford
       to render fresh then) but their CSS display size was being left
       alone in the meantime — a slide zoomed in, then back out, kept
       showing at its old (zoomed) size until you actually scrolled to
       it and a fresh render finally corrected it. Rescaling every
       canvas's existing width/height by the zoom ratio right away fixes
       the size instantly (a plain CSS stretch of the old bitmap, soft
       until the real crisp redraw lands) instead of leaving it stuck at
       the previous zoom level for however long that takes. */
    var toRerenderNow = getCurrentlyVisibleCanvases();
    state.canvases.forEach(function (c) {
      delete c.dataset.rendered;
      delete c.dataset.queued;
      if (c.style.width) {
        c.style.width = (parseFloat(c.style.width) * zoomRatio) + 'px';
        c.style.height = (parseFloat(c.style.height) * zoomRatio) + 'px';
      }
    });
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
  /* A native "click" fires on whatever element the mouse is over at
     mouseup, regardless of how far it moved since mousedown — dragging
     to pan and happening to release outside the panel (over the
     backdrop) was firing the backdrop's click-to-close, closing the
     viewer on an accidental drag rather than an actual click on the
     backdrop. justPanned swallows that one trailing click; the
     setTimeout(...,0) resets it on the next tick, after the click
     (which fires synchronously right after mouseup, same tick) has
     already been suppressed. */
  var justPanned = false;
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
    justPanned = true;
    setTimeout(function () { justPanned = false; }, 0);
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
    var videoOverlay = VIDEO_OVERLAYS[pdfSlugFromUrl(state.url)];
    for (var i = 0; i < pdf.numPages; i++) {
      var c = document.createElement('canvas');
      c.className = 'pdf-overlay__page';
      if (videoOverlay && videoOverlay.page === i + 1) {
        var wrap = buildVideoOverlay(videoOverlay);
        wrap.insertBefore(c, wrap.firstChild);
        pagesWrap.appendChild(wrap);
      } else {
        pagesWrap.appendChild(c);
      }
      state.canvases.push(c);
    }
    viewport.scrollTop = 0;
    wireScrollSpy();
    /* warmUp only ever needs to run once per actual document load — the
       race it's guarding against is specific to a document's FIRST
       render right after loading, not to "reopening the modal." It was
       running unconditionally on every open, including reopens of an
       already-cached doc, adding its up-to-800ms wait every single
       time for no benefit the second time onward. Tagging the doc
       object itself once it's been through warm-up skips it for every
       subsequent reopen of that same file this session. */
    if (pdf.__warmed) {
      layoutForBreakpoint();
    } else {
      warmUp(pdf).then(function () {
        pdf.__warmed = true;
        if (myToken !== state.renderToken) return;
        layoutForBreakpoint();
      });
    }
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
    // GA4: fresh scroll-depth read for whichever project this open/switch lands on
    if (window.__resetPdfScrollDepth) window.__resetPdfScrollDepth();

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

  /* Locks background scrolling while the modal is open WITHOUT touching
     body's own CSS (position/overflow) — that used to be a plain
     `body.style.overflow = 'hidden'`, but Selected Work's desktop
     layout is actively pinned via a GSAP ScrollTrigger, and toggling
     overflow on body mid-pin was reported shifting that section's
     content upward once the modal closed (a real, confirmed reflow
     side-effect, not imagined). Intercepting the scroll-causing events
     directly instead — and only for ones that didn't originate inside
     the modal itself, so the PDF viewport keeps scrolling/zooming
     normally — never touches body's box model at all, so there's
     nothing for GSAP's pin math to get out of sync with. */
  function blockBackgroundScroll(e) {
    if (overlay.contains(e.target)) return;
    e.preventDefault();
  }
  function lockScroll() {
    document.addEventListener('wheel', blockBackgroundScroll, { passive: false });
    document.addEventListener('touchmove', blockBackgroundScroll, { passive: false });
  }
  function unlockScroll() {
    document.removeEventListener('wheel', blockBackgroundScroll, { passive: false });
    document.removeEventListener('touchmove', blockBackgroundScroll, { passive: false });
  }

  /* GA4 event for "a project was opened" — fires on the initial click
     AND on switching via the project-nav arrows (both are, from the
     visitor's side, "opening a project"). project_name is derived from
     the PDF filename itself (stable, unaffected by title-copy edits or
     cache-bust ?v= bumps) rather than the card's visible h3 text —
     e.g. assets/p2/poc.pdf?v=2 -> "poc". Guarded on gtag existing so a
     blocked/failed-to-load analytics script can't break the modal. */
  function trackProjectClick(card) {
    if (typeof gtag !== 'function' || !card || !card.dataset.pdf) return;
    var slug = card.dataset.pdf.split('/').pop().split('?')[0].replace(/\.pdf$/i, '');
    gtag('event', 'project_click', { project_name: slug });
  }

  var openedFromCard = null;
  function open(card) {
    var h3 = card.querySelector('h3');
    openedFromCard = card;
    trackProjectClick(card);
    overlay.classList.add('is-open');
    lockScroll();
    /* The desktop coverflow ring keeps auto-orbiting via its own
       gsap.ticker loop (carousel.js) regardless of what else is on
       screen — it was never told the modal exists. Left running, the
       card that was "front and center" when you clicked has physically
       rotated away by the time you close the modal, so you never land
       back on the same one visually even though openedFromCard.
       scrollIntoView (below) is scrolling to the right DOM element —
       the ring itself has moved under it. carousel.js checks this flag
       every tick and freezes in place while it's set. */
    window.__pdfModalOpen = true;
    /* Without this, Android's hardware/gesture back button doesn't
       close the modal — it just runs the browser's normal back
       navigation, which (since opening the modal never left this page)
       exits the site entirely. Pushing a history entry when the modal
       opens means "back" has something of ours to pop first; the
       popstate listener below intercepts that pop and closes the modal
       instead of letting the navigation continue. */
    history.pushState({ pdfModal: true }, '', location.href);
    loadPdf(card.dataset.pdf, h3 ? h3.textContent : '');
  }
  /* Desktop project-switching arrows (outside the panel) — reuses
     loadPdf() directly rather than the full open(), since none of
     open()'s one-time setup (history entry, scroll lock, freezing the
     coverflow) needs to happen again; the modal's already open and
     staying open, only the file changes. */
  function switchProject(delta) {
    if (pdfCards.length < 2) return;
    var idx = pdfCards.indexOf(openedFromCard);
    if (idx < 0) idx = 0;
    var card = pdfCards[(idx + delta + pdfCards.length) % pdfCards.length];
    var h3 = card.querySelector('h3');
    openedFromCard = card;
    trackProjectClick(card);
    loadPdf(card.dataset.pdf, h3 ? h3.textContent : '');
  }
  /* Returning to the exact card you opened matters on MOBILE, where the
     card stack sits inside a very tall, normal-document-flow section —
     losing your place there means scrolling back through everything to
     find it again, and scrollIntoView on the actual card element stays
     correct there even if something reflowed while the modal was open.

     Deliberately NOT done on desktop — confirmed causing the exact
     "just opening and closing pushes the page up" bug. Desktop's
     Selected Work is a GSAP-pinned, scroll-scrubbed flip animation
     where panels are absolutely positioned, not laid out in normal
     flow; scrollIntoView's target-position math assumes normal flow
     and was resolving to the wrong place there. It's also simply not
     needed on desktop: nothing in this whole open/close flow changes
     window scrollY while the modal is up (background scroll is
     blocked, not redirected), so the page is already exactly where it
     was the moment you close it — there's nothing to restore. */
  function close(viaPopstate) {
    state.renderToken++; // cancels any render still in flight
    overlay.classList.remove('is-open');
    unlockScroll();
    window.__pdfModalOpen = false;
    if (openedFromCard) {
      if (state.isMobile) openedFromCard.scrollIntoView({ block: 'center', behavior: 'instant' });
      openedFromCard = null;
    }
    if (!viaPopstate && history.state && history.state.pdfModal) history.back();
  }
  window.addEventListener('popstate', function () {
    if (overlay.classList.contains('is-open')) close(true);
  });

  pdfCards.forEach(function (card) {
    card.addEventListener('click', function () { open(card); });
  });
  closeBtn.addEventListener('click', function () { close(false); });
  // GA4: how far into this specific case study people actually scroll
  viewport.addEventListener('scroll', function () {
    if (!window.__trackPdfScroll || !state.url) return;
    var slug = state.url.split('/').pop().split('?')[0].replace(/\.pdf$/i, '');
    window.__trackPdfScroll(viewport, slug);
  }, { passive: true });
  if (zoomInBtn) zoomInBtn.addEventListener('click', function () { setZoom(state.zoom + ZOOM_STEP); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { setZoom(state.zoom - ZOOM_STEP); });
  /* opens the raw PDF file in a new tab — the browser's own viewer
     fills the whole window, which is the simplest, most reliable
     "full screen" available without a custom fullscreen-API state to
     keep in sync with the modal's own zoom/pan/page tracking. */
  if (fullscreenBtn) fullscreenBtn.addEventListener('click', function () {
    if (state.url) window.open(state.url, '_blank');
  });
  if (projPrevBtn) projPrevBtn.addEventListener('click', function () { switchProject(-1); });
  if (projNextBtn) projNextBtn.addEventListener('click', function () { switchProject(1); });
  if (pdfCards.length < 2) {
    if (projPrevBtn) projPrevBtn.hidden = true;
    if (projNextBtn) projNextBtn.hidden = true;
  }
  overlay.addEventListener('click', function (e) { if (e.target === overlay && !justPanned) close(); });
  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
  });
  /* ctrl+wheel/trackpad-pinch drives setZoom() directly — Chrome/Firefox
     report that gesture as a wheel event with ctrlKey true. A leak
     where this also zoomed the whole page (header included) was
     reported once, but from Chrome DevTools' inspect/responsive mode
     specifically, which doesn't always behave like a real browser
     window for gesture handling — buttons stay available as a fallback
     either way. wheelZoomLocked debounces a single gesture (which
     fires many small wheel events) down to one zoom step. NOTE: this
     can't (and, by design, shouldn't) block zooming via an actual
     keyboard shortcut (Cmd/Ctrl +/-) — browsers deliberately keep that
     user-initiated path un-blockable by page JS for accessibility. */
  var wheelZoomLocked = false;
  overlay.addEventListener('wheel', function (e) {
    if (!e.ctrlKey || state.isMobile) return;
    e.preventDefault();
    if (wheelZoomLocked) return;
    wheelZoomLocked = true;
    setZoom(state.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    setTimeout(function () { wheelZoomLocked = false; }, 220);
  }, { passive: false });
  overlay.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  overlay.addEventListener('gesturechange', function (e) { e.preventDefault(); });
  /* Custom two-finger pinch, scoped to the content viewport only. Gives
     live visual feedback via a cheap CSS transform while the fingers
     are actually moving (no canvas re-render mid-gesture — pdf.js
     render() calls are too slow to keep up with continuous pinch
     deltas, and firing many in quick succession is exactly the kind of
     overlap that's caused real render-race bugs elsewhere in this
     file); commits to a real, crisp re-render via setZoom() only once
     the gesture ends. */
  var pinchState = null;
  function touchDistance(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  viewport.addEventListener('touchstart', function (e) {
    if (!state.isMobile || e.touches.length !== 2) return;
    pinchState = { startDist: touchDistance(e.touches), startZoom: state.zoom };
  }, { passive: true });
  viewport.addEventListener('touchmove', function (e) {
    if (!state.isMobile || e.touches.length !== 2) return;
    e.preventDefault(); // blocks native pinch-zoom on Android Chrome specifically
    if (!pinchState) return;
    var factor = touchDistance(e.touches) / pinchState.startDist;
    var preview = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchState.startZoom * factor));
    pagesWrap.style.transform = 'scale(' + (preview / state.zoom) + ')';
    pagesWrap.dataset.pendingZoom = preview;
  }, { passive: false });
  function endPinch() {
    if (!pinchState) return;
    pinchState = null;
    var pending = pagesWrap.dataset.pendingZoom;
    pagesWrap.style.transform = '';
    delete pagesWrap.dataset.pendingZoom;
    if (pending) setZoom(parseFloat(pending));
  }
  viewport.addEventListener('touchend', function (e) { if (e.touches.length < 2) endPinch(); }, { passive: true });
  viewport.addEventListener('touchcancel', endPinch, { passive: true });
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
