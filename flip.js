(function () {
  "use strict";
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return; // graceful fallback = stacked page
  gsap.registerPlugin(ScrollTrigger);

  const panels = gsap.utils.toArray(".panel");
  const dots   = gsap.utils.toArray(".dot");
  const body   = document.body;
  const N      = panels.length;

  /* reveal start/end states per data-anim type */
  function revealStates(el) {
    switch (el.dataset.anim) {
      case "up":      return [{ opacity: 0, y: 44 }, { opacity: 1, y: 0 }];
      case "pop":     return [{ opacity: 0, scale: 0.3, rotation: -25 }, { opacity: 1, scale: 1, rotation: 0 }];
      case "cardIn":  return [{ opacity: 0, x: -60 }, { opacity: 1, x: 0 }];
      case "photoIn": return [{ opacity: 0, y: -38, scale: 0.94 }, { opacity: 1, y: 0, scale: 1 }];
      case "toolsIn": return [{ opacity: 0, x: 44 }, { opacity: 1, x: 0 }];
      case "strip": {
        const dir = el.classList.contains("paper-strip--bottom") ? 100 : -100;
        return [{ yPercent: dir, opacity: 0 }, { yPercent: 0, opacity: 1 }];
      }
      default:        return [{ opacity: 0 }, { opacity: 1 }];
    }
  }
  function revealDuration(type) {
    switch (type) {
      case "photoIn": case "strip": return 0.5;
      case "cardIn": case "up":     return 0.45;
      case "toolsIn":               return 0.4;
      case "pop":                   return 0.35;
      default:                      return 0.4;
    }
  }
  function setActiveDot(i) { dots.forEach((d, di) => d.classList.toggle("is-active", di === i)); }

  /* Nav-dot jumps: the browser's native smooth-scroll (behavior:
     "smooth") takes roughly the same wall-clock time regardless of
     distance, which made multi-panel jumps play the scroll-scrubbed
     flip animation abnormally fast — 3 panels' worth of flip crammed
     into the same duration a single-panel jump gets. Animating the
     scroll ourselves instead lets duration scale with distance, so a
     bigger jump takes proportionally longer and the flip always reads
     at roughly the same rate no matter how many panels it's skipping. */
  function animatedScrollTo(target) {
    const startY = window.scrollY || window.pageYOffset;
    const distance = Math.abs(target - startY);
    const duration = Math.min(1.6, Math.max(0.45, distance / 1400));
    const state = { y: startY };
    gsap.to(state, {
      y: target,
      duration,
      ease: "power2.inOut",
      onUpdate: () => window.scrollTo(0, state.y)
    });
  }

  const mm = gsap.matchMedia();

  /* ---------- WIDE SCREENS: page-flip ---------- */
  mm.add("(min-width: 861px) and (prefers-reduced-motion: no-preference)", () => {
    body.classList.add("js-flip");
    let prevIdx = -1;
    panels.forEach((p, i) => { p.style.zIndex = String(N - i); });  // turning page above the next

    const shades = [];
    for (let i = 0; i < N - 1; i++) {
      const s = document.createElement("div");
      s.className = "flip-shade";
      panels[i].appendChild(s);
      shades.push(s);
    }

    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: "#horizontal",
        start: "top top",
        end: () => "+=" + (window.innerHeight * (N - 1) * 1.15),
        pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: (self) => {
          const idx = Math.round(self.progress * (N - 1));
          setActiveDot(idx);
          if (idx !== prevIdx) {
            prevIdx = idx;
            // hook: fire when a given page becomes active (here: page index 1)
            if (idx === 1 && window.__carouselOnActive) window.__carouselOnActive();
            // hook: the "scroll to continue" hint only runs/shows while Home is active
            if (window.__scrollHintSetHome) window.__scrollHintSetHome(idx === 0);
          }
        }
      }
    });

    function addReveals(panel, base) {
      const els = gsap.utils.toArray(panel.querySelectorAll("[data-anim]"));
      const step = els.length > 1 ? Math.min(0.05, 0.3 / (els.length - 1)) : 0;
      els.forEach((el, i) => {
        const [from, to] = revealStates(el);
        tl.fromTo(el, from, { ...to, duration: revealDuration(el.dataset.anim), ease: "power3.out" }, base + i * step);
      });
    }

    for (let i = 0; i < N - 1; i++) {
      tl.to(panels[i], { rotateY: -180, duration: 1, ease: "power1.inOut" }, i)
        .fromTo(shades[i], { opacity: 0 }, { opacity: 0.4, duration: 0.5, ease: "power1.in" }, i)
        .to(shades[i], { opacity: 0, duration: 0.5, ease: "power1.out" }, i + 0.5);
      addReveals(panels[i + 1], i + 0.15);   // incoming page reveals as it comes forward
    }

    /* first page isn't hidden — it animates in once, on load */
    const intro = gsap.timeline();
    gsap.utils.toArray(panels[0].querySelectorAll("[data-anim]")).forEach((el, i) => {
      const [from, to] = revealStates(el);
      intro.fromTo(el, from, { ...to, duration: revealDuration(el.dataset.anim) + 0.3, ease: "power3.out" }, i * 0.09);
    });

    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const i = parseInt(dot.dataset.go, 10);
        const st = tl.scrollTrigger;
        const target = st.start + (st.end - st.start) * (i / (N - 1));
        animatedScrollTo(target);
      });
    });

    return () => {   // cleanup when leaving this breakpoint
      body.classList.remove("js-flip");
      panels.forEach((p) => { p.style.zIndex = ""; });
      shades.forEach((s) => s.remove());
      gsap.set(panels, { clearProps: "transform" });
    };
  });

  /* shared: dot navigation + active tracking for the vertical (non-flip) layouts */
  function wireVerticalDots() {
    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const i = parseInt(dot.dataset.go, 10);
        animatedScrollTo(panels[i].offsetTop);
      });
    });
    panels.forEach((panel, i) => {
      ScrollTrigger.create({
        trigger: panel, start: "top center", end: "bottom center",
        onToggle: (self) => { if (self.isActive) setActiveDot(i); }
      });
    });
  }

  /* ---------- PHONES: vertical scroll with gentle reveals ---------- */
  mm.add("(max-width: 860px) and (prefers-reduced-motion: no-preference)", () => {
    gsap.utils.toArray("[data-anim]").forEach((el) => {
      /* Home's bottom torn-paper transition is bottom-anchored deep
         inside the viewport-height hero (by design — it has to sit at
         the hero's bottom edge, not flow after the content). A
         position-based "top 85%" scroll trigger only fires once you've
         scrolled ~127px down, which fails the "visible on first load,
         no scrolling" requirement for it. It's structural chrome, not
         entrance content, so it just skips the reveal system and
         renders at full opacity immediately. */
      if (el.closest("#panel-1 .paper-strip-wrap--bottom")) return;
      /* #carousel itself (not its cards) keeps a lingering inline
         transform after this entrance animation plays (GSAP doesn't
         clear it — the ScrollTrigger's toggleActions:"...reverse"
         needs a value to animate back to if you scroll up again). That
         leftover transform on an ANCESTOR of the sticky-positioned
         .pcard elements breaks their position: sticky — confirmed live
         (cards stopped pinning, the heading appeared to "move with"
         them since it was the only thing genuinely still stuck). The
         cards themselves already have plenty of scroll-driven visual
         interest from the stack effect, so this entrance animation
         just isn't worth the risk on mobile. Desktop is untouched —
         its own reveal system (addReveals(), above) still runs this. */
      if (el.id === "carousel") return;
      const [from, to] = revealStates(el);
      gsap.fromTo(el, from, {
        ...to, duration: 0.8, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none reverse" }
      });
    });
    wireVerticalDots();

    /* Selected Work's heading pins above the card stack for exactly as
       long as the stack itself is scrolling. Two earlier approaches
       both drifted out of sync with the real last-card release point:
       plain CSS position: sticky stuck for as long as .stage's own
       (much taller) containing block allowed; a class-toggle with a
       hand-guessed pixel "end" offset also missed (confirmed: the
       trailing spacer's real position when the card actually released
       wasn't anywhere near the offset the math assumed). GSAP's own
       `pin` measures #carouselStage's real rendered bottom edge at
       refresh time instead of guessing a pixel value, so it can't
       drift — release the pin exactly when that container's bottom
       reaches the same 129px line the cards themselves stick at.
       pinSpacing: false because the heading isn't meant to reserve
       extra layout space the way a normal pin would (it overlays the
       cards scrolling underneath it, same as position: sticky would). */
    if (document.querySelector(".p2-heading") && document.querySelector("#carouselStage")) {
      ScrollTrigger.create({
        trigger: ".p2-heading",
        start: "top 28px",
        endTrigger: "#carouselStage",
        end: "bottom 650px", // calibrated against the actual measured release point (129px undershot it by ~500px)
        pin: true,
        pinSpacing: false
      });
    }
  });

  /* ---------- REDUCED MOTION: no animation, everything visible ---------- */
  mm.add("(prefers-reduced-motion: reduce)", () => { wireVerticalDots(); });

  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
