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

  /* MOBILE: no JS at all — styles.css lays the cards out as a plain
     sticky-positioned stack in normal document flow (each card pins at
     the same scroll offset, so the next one slides up and covers it).
     Was previously a hand-rolled touch-swipe engine (discrete index,
     live drag tracking, a "1/8" counter pill); replaced entirely by
     the stack, which needs no touch handlers and can't fight with the
     browser's native scroll/zoom gestures the way the swipe engine
     occasionally did. */
  if (isTouch) return;

  /* pagination — a single "current/total" counter in a pill (e.g.
     "1/8"), desktop only now (mobile dropped the counter along with
     the swipe carousel — see above). Built to match whatever n is
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
      /* the "1/8" pill never actually updated past its initial "1" —
         pre-existing, unrelated to the mobile stack rework, fixed
         while already in this function */
      if (want >= 0 && counterCurrent) counterCurrent.textContent = String(want + 1);
    }
  }

  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    /* pdf-viewer.js sets this while its modal is open. Without it, the
       ring keeps auto-orbiting behind the modal, so whichever card was
       front-and-center when you clicked has physically rotated away by
       the time you close it — you never land back on the same one,
       even though the modal itself correctly scrolls back to that
       card's DOM element (the ring under it has simply moved). Freezing
       phase (and skipping the render/focus updates, since nothing's
       changed) keeps the ring exactly as you left it. */
    if (window.__pdfModalOpen) return;
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
