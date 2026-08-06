function initCarousel() {
  const root = document.getElementById("carousel");
  if (!root) return;
  const stage = document.getElementById("carouselStage");
  const nav = document.getElementById("carouselNav");
  const cards = gsap.utils.toArray(stage.querySelectorAll(".pcard"));
  const n = cards.length;
  if (!n) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(max-width: 860px)").matches;

  /* pagination — a single "current/total" counter in a pill (e.g.
     "1/8") instead of one dot per card. Built to match whatever n is
     rather than hard-coding the total. */
  const dotsWrap = document.getElementById("carouselDots");
  let counterCurrent = null;
  if (dotsWrap) {
    dotsWrap.innerHTML = "";
    const pill = document.createElement("div");
    pill.className = "carousel__counter";
    counterCurrent = document.createElement("span");
    counterCurrent.textContent = "1";
    const sep = document.createElement("span");
    sep.textContent = "/";
    const total = document.createElement("span");
    total.textContent = String(n);
    pill.append(counterCurrent, sep, total);
    dotsWrap.appendChild(pill);
  }

  /* =====================================================================
     MOBILE: a discrete current-index carousel using the frame's REAL
     card widths (204px side / 232px focused) and a flat 16px gap,
     rather than a uniform base size scaled by a transform — scaling a
     single base size can't produce an exact flat gap once the centre
     card is a different size from its neighbours (the gap balloons by
     however much the centre card grows). Still an infinite loop: every
     card's signed distance from `current` wraps circularly, so there
     are always neighbours peeking on both sides, including past the
     first/last card. Only cards within 2 slots of centre are
     positioned/shown; the rest sit hidden.
     ===================================================================== */
  if (isTouch) {
    root.classList.add("is-fan");
    cards.forEach((c) => { c.style.transition = "transform .35s ease, width .35s ease, opacity .35s ease"; });

    let current = 0;
    let sideW = 0, focusW = 0, gap = 16;
    function measure() {
      sideW = cards[0].getBoundingClientRect().width || 204;
      focusW = sideW * (232 / 204);
      gap = 16 * (sideW / 204);
    }
    measure();
    window.addEventListener("resize", measure);

    function centerForSlot(d) {
      if (d === 0) return 0;
      const dir = d > 0 ? 1 : -1;
      let x = focusW / 2 + gap + sideW / 2;
      for (let k = 2; k <= Math.abs(d); k++) x += sideW + gap;
      return dir * x;
    }

    /* `drag` is a live px offset applied to every card while a finger is
       down, on top of the settled index positions — this is what makes
       the row visibly track the finger in real time instead of only
       snapping once on release. Cards now follow the finger 1:1
       (dragging right-to-left moves them left, same direction as the
       finger — reversed from the earlier "opposite direction" build
       per feedback), so `drag = dx` directly. */
    let drag = 0;

    /* The title's 1-line<->2-line reveal and the "Read more" button's
       show/hide are driven by max-height transitions in styles.css (see
       .pcard__cap h3 / .pcard__arrow) rather than a JS fade+delay hack —
       a plain class toggle here is enough, because max-height (unlike
       white-space/display) genuinely animates, so it glides open/shut
       in step with the same .is-focus toggle that drives the width/
       transform transition — one continuous motion, nothing to
       orchestrate or time by hand. */
    function render() {
      for (let i = 0; i < n; i++) {
        let d = (((i - current) % n) + n) % n;
        if (d > n / 2) d -= n; // shortest signed distance, wraps past either end
        const el = cards[i];
        const visible = Math.abs(d) <= 2;
        el.style.opacity = visible ? "1" : "0";
        el.style.zIndex = String(100 - Math.abs(d));
        el.style.width = (d === 0 ? focusW : sideW).toFixed(1) + "px";
        const x = (visible ? centerForSlot(d) : centerForSlot(d < 0 ? -3 : 3)) + drag;
        el.style.transform = "translate(-50%,-50%) translateX(" + x.toFixed(1) + "px)";
        el.classList.toggle("is-focus", d === 0);
        if (d === 0 && counterCurrent) counterCurrent.textContent = String(i + 1);
      }
    }
    render();

    function goTo(i) { current = ((i % n) + n) % n; render(); }

    function setTransition(on) {
      cards.forEach((c) => { c.style.transition = on ? "transform .35s ease, width .35s ease, opacity .35s ease" : "none"; });
    }
    setTransition(true);

    let touchStartX = null;
    root.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      drag = 0;
      setTransition(false); // live 1:1 tracking while the finger is down, no easing lag
    }, { passive: true });
    root.addEventListener("touchmove", (e) => {
      if (touchStartX === null) return;
      drag = e.touches[0].clientX - touchStartX;
      render();
    }, { passive: true });
    root.addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      drag = 0;
      setTransition(true); // ease into the settled/snapped position
      if (Math.abs(dx) > 30) goTo(current + (dx < 0 ? 1 : -1));
      else render();
    }, { passive: true });

    return; // skip the desktop orbit engine entirely on mobile
  }

  /* =====================================================================
     DESKTOP: circular "coverflow" — hover-driven fan-out with an
     orbiting idle state, arrow-nav stepping, GSAP-ticked.
     ===================================================================== */
  const TAU = Math.PI * 2;
  const STEP = TAU / n;

  /* ---- tunables (spread/tilt calibrated to the Figma mockup's fan) ---- */
  /* SPEED is negative on purpose: with th = phase + i*STEP driving
     x = R*sin(th) and y going most-negative (topmost) at th = π, an
     increasing phase traces bottom -> right -> top -> left -> bottom,
     which is anticlockwise. Flipping the sign reverses phase's drift so
     the same front-most card instead swings bottom -> left -> top ->
     right -> bottom -- clockwise. */
  const AUTO = { R: 0.33, ARCY: 0.16, MINS: 0.60, MAXS: 1.0, MINOP: 1.0, TILT: 10, SPEED: -0.11 };
  const FOCUS_BOOST = 0.14;   // how much the centred card grows on hover
  const SIDE_DIM = 0;         // side cards no longer dim on hover — stay at 100% opacity

  let W = 0, H = 0;
  const measure = () => { W = root.clientWidth; H = root.clientHeight; };
  measure();
  window.addEventListener("resize", measure);

  let phase = 0, phaseTarget = 0, hovering = reduce;
  const focus = { f: reduce ? 1 : 0 };
  if (reduce) root.classList.add("is-fan");

  const wrapPI = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  function pos(i) {
    const th = phase + i * STEP;
    const s = Math.sin(th), c = Math.cos(th), depth = (c + 1) / 2;
    return {
      x: AUTO.R * W * s,
      y: -AUTO.ARCY * H * (1 - c) / 2,
      sc: AUTO.MINS + (AUTO.MAXS - AUTO.MINS) * depth,
      rot: -AUTO.TILT * s,
      op: AUTO.MINOP + (1 - AUTO.MINOP) * depth,
      depth
    };
  }
  function render() {
    const f = focus.f;
    for (let i = 0; i < n; i++) {
      const p = pos(i);
      const sc = p.sc * (1 + f * FOCUS_BOOST * p.depth * p.depth);   // hero grows on hover
      const op = p.op * (1 - f * SIDE_DIM * (1 - p.depth));          // sides dim a touch
      const el = cards[i];
      el.style.transform =
        "translate(-50%,-50%) translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) +
        "px) scale(" + sc.toFixed(3) + ") rotate(" + p.rot.toFixed(2) + "deg)";
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = Math.round(p.depth * 100);
    }
  }

  /* snap the currently-nearest card to dead centre */
  function snapNearest() {
    let bestK = 0, best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(wrapPI(phase + i * STEP));
      if (d < best) { best = d; bestK = i; }
    }
    phaseTarget = phase - wrapPI(phase + bestK * STEP);
  }

  /* mark the centred card as focused (green title + arrow) while fanned */
  let focusIdx = -1;
  function updateFocus() {
    let want = -1;
    if (focus.f > 0.5) {
      let best = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(wrapPI(phase + i * STEP)); if (d < best) { best = d; want = i; } }
    }
    if (want !== focusIdx) {
      if (focusIdx >= 0) cards[focusIdx].classList.remove("is-focus");
      if (want >= 0) cards[want].classList.add("is-focus");
      focusIdx = want;
    }
  }

  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (hovering) {
      phase += (phaseTarget - phase) * Math.min(1, dt * 6);   // ease to snapped/arrowed target
    } else if (!reduce) {
      phase += AUTO.SPEED * dt;                                // free orbit
    }
    render();
    updateFocus();
  });

  /* Hover only ever engages after a REAL pointer movement over the cards — not
     merely from a "mouseenter". This is what gives the landing grace: when the
     page flip reveals the carousel underneath an already-stationary pointer,
     browsers still fire a mouseenter the instant that pointer position becomes
     hit-testable, even though the user never actually moved anything. Gating
     on mousemove (rather than trusting mouseenter alone) means the carousel
     keeps orbiting through that phantom mouseenter and only fans out once the
     pointer genuinely moves — on landing or at any other time. */
  let pointerOver = false, engaged = false;
  function applyHover() {
    const active = pointerOver && engaged;
    hovering = active;
    if (active) { snapNearest(); root.classList.add("is-fan"); gsap.to(focus, { f: 1, duration: 0.5, ease: "power2.out", overwrite: true }); }
    else { root.classList.remove("is-fan"); gsap.to(focus, { f: 0, duration: 0.5, ease: "power2.inOut", overwrite: true }); }
  }
  if (!reduce) {
    root.addEventListener("mouseenter", () => { pointerOver = true; applyHover(); });
    root.addEventListener("mouseleave", () => { pointerOver = false; engaged = false; applyHover(); });
    root.addEventListener("mousemove", () => {
      if (pointerOver && !engaged) { engaged = true; applyHover(); }
    });
  }

  /* arrows rotate the ring by exactly one card. Note the minus sign:
     `phase` is added to each card's own angle (th = phase + i*STEP), so
     increasing phase brings a LOWER index into the centred position
     (th=0) — the opposite of what "next/right" should do. Subtracting
     is what makes the right arrow (data-dir="1", the higher/next index)
     actually pull in the card that was sitting on the right. */
  nav.querySelectorAll(".cbtn").forEach((btn) => {
    btn.addEventListener("click", () => { phaseTarget -= parseInt(btn.dataset.dir, 10) * STEP; });
  });
}
initCarousel();
