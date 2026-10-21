/* Shared behaviour for the case-study pages (work/*.html).

   1. Scroll reveals for .cs-reveal blocks.
   2. The "Selected work" film strip at the end of every page — built from
      the PROJECTS list below so the strip only has to be updated in one
      place. */
(function () {
  var PROJECTS = [
    { title: 'Plans page redesign',      meta: 'Proptech · B2C · Case study',  cover: 'hp-plans-page.jpg',        href: 'plans-page-redesign.html' },
    { title: 'Bricks design system',     meta: 'Design systems · Case study',  cover: 'bricks-design-system.jpg', href: 'bricks-design-system.html' },
    { title: 'Owner dashboard revamp',   meta: 'Proptech · C2C · Project',     cover: 'owner-dashboard.jpg',      href: 'owner-dashboard-revamp.html' },
    { title: 'Unstop bridge',            meta: 'Edtech · SaaS · Case study',    cover: 'unstop-bridge.jpg',        href: 'unstop-bridge.html' },
    { title: 'Pay on credit',            meta: 'Fintech · B2C · Case study',   cover: 'pay-on-credit.jpg',        href: 'pay-on-credit.html' },
    { title: 'Interactive landing page', meta: 'Edtech · Growth · Project',    cover: 'unstop-landing.jpg',       href: 'interactive-landing-page.html' },
    { title: 'Premium user dashboard',   meta: 'Proptech · B2C · Project',     cover: 'hp-dashboard.jpg',         href: 'premium-user-dashboard.html' }
  ];

  /* ---------- film strip ---------- */
  var mount = document.querySelector('[data-film-strip]');
  if (mount) {
    var here = location.pathname.split('/').pop();
    var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };

    function group(hidden) {
      return '<div class="cs-film__group"' + (hidden ? ' aria-hidden="true"' : '') + '>' +
        PROJECTS.map(function (p) {
          var current = p.href === here;
          var arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
          return '<a class="cs-film__item' + (current ? ' is-current' : '') + '" href="' + (current ? '#top' : esc(p.href)) + '"' +
            (hidden ? ' tabindex="-1"' : '') + '>' +
            '<span class="cs-film__cover">' +
              '<img src="../assets/p2/' + p.cover + '" width="1040" height="1280" alt="" loading="lazy" decoding="async" draggable="false" />' +
              (current ? '<span class="cs-film__here">Reading now</span>' : '') +
            '</span>' +
            '<span class="cs-film__cap">' +
              '<span class="cs-film__text">' +
                '<span class="cs-film__title">' + esc(p.title) + '</span>' +
                '<span class="cs-film__meta">' + esc(p.meta) + '</span>' +
              '</span>' +
              (current ? '' : '<span class="cs-film__badge">' + arrow + '</span>') +
            '</span>' +
          '</a>';
        }).join('') +
      '</div>';
    }

    mount.innerHTML = '<div class="cs-film__track">' + group(false) + group(true) + '</div>';
    drift(mount);
  }

  /* Auto-drift + hand scrolling on the same native scroller. `pos` is the
     float position we drive (scrollLeft alone can't hold sub-pixel steps);
     whenever the user scrolls, pos is re-read from scrollLeft. Crossing one
     group's width in either direction jumps back by exactly that width —
     both groups are identical, so the jump is invisible and it never ends. */
  function drift(film) {
    var SPEED = 40;                       // px per second
    var RESUME_AFTER = 2500;              // ms of no interaction before drifting again
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var group = film.querySelector('.cs-film__group');
    var pos = 0, last = 0, hovering = false, holdUntil = 0;

    function width() { return group.getBoundingClientRect().width; }
    function setPos(x) {
      var w = width();
      if (w > 0) { while (x > w) x -= w; while (x < 1) x += w; }   // keep within (0, w]
      pos = x; film.scrollLeft = x;
    }
    function hold() { holdUntil = performance.now() + RESUME_AFTER; }

    // user scrolling (trackpad, touch, keyboard): follow it and wrap
    film.addEventListener('scroll', function () {
      var w = width(), x = film.scrollLeft;
      if (Math.abs(x - pos) < 1) return;  // our own drift step, not the user
      hold();
      if (w > 0 && (x > w || x < 1)) setPos(x); else pos = x;
    }, { passive: true });

    film.addEventListener('mouseenter', function () { hovering = true; });
    film.addEventListener('mouseleave', function () { hovering = false; });
    film.addEventListener('focusin', function () { hovering = true; });
    film.addEventListener('focusout', function () { hovering = false; });
    film.addEventListener('touchstart', hold, { passive: true });

    // mouse drag-to-scroll; a real drag swallows the click that ends it
    var dragX = null, dragFrom = 0, dragged = false;
    film.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragX = e.clientX; dragFrom = pos; dragged = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (dragX === null) return;
      var dx = e.clientX - dragX;
      if (!dragged && Math.abs(dx) > 5) { dragged = true; film.classList.add('is-dragging'); }
      if (dragged) { hold(); setPos(dragFrom - dx); }
    });
    window.addEventListener('pointerup', function () {
      if (dragX === null) return;
      dragX = null;
      if (dragged) setTimeout(function () { film.classList.remove('is-dragging'); }, 0);
    });
    film.addEventListener('click', function (e) { if (dragged) { e.preventDefault(); dragged = false; } }, true);

    if (reduce) return;                   // no drift; hand scrolling still works
    function tick(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (!hovering && dragX === null && now > holdUntil) setPos(pos + SPEED * dt);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- reveal on scroll ---------- */
  var els = document.querySelectorAll('.cs-reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-in'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  els.forEach(function (el) { io.observe(el); });

  /* ---------- "Go back" ----------
     Back to the homepage as it was left: step back through history past
     every project opened from "Keep exploring" since then, so the browser
     returns to that same page (no fresh load, nothing replaying). Opened
     directly / from elsewhere → the #work link.
     depth = how many project pages since the homepage in this tab, kept on
     this history entry (for back/forward) and handed to the next project
     page through sessionStorage. */
  var depth = 0;
  try {
    var st = history.state || {};
    if (typeof st.csDepth === 'number') depth = st.csDepth;
    else {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin) {
        if (/\/(index\.html)?$/.test(ref.pathname)) depth = 1;
        else if (/\/work\/[^/]+$/.test(ref.pathname)) { var prev = +sessionStorage.getItem('cs-depth') || 0; depth = prev ? prev + 1 : 0; }
      }
      history.replaceState(Object.assign({}, st, { csDepth: depth }), '');
    }
  } catch (err) {}
  // (pageshow also runs when the browser restores this page on back/forward)
  window.addEventListener('pageshow', function () { try { sessionStorage.setItem('cs-depth', String(depth)); } catch (err) {} });

  var back = document.querySelector('.cs-back');
  if (back) back.addEventListener('click', function (e) {
    if (depth > 0 && history.length > depth) { e.preventDefault(); history.go(-depth); }
  });

  // "Reading now" in the strip: back to the top, without adding a history step
  if (mount) mount.addEventListener('click', function (e) {
    var cur = e.target.closest('.cs-film__item.is-current');
    if (cur) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
})();
