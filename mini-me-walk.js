/* Case studies: a reading-progress bar along the bottom of the top bar,
   with a tiny mini-me walking on it.

   - The bar fills as you scroll; she stands at its tip and walks with it
     (her steps are driven by how far the tip moves, so she stops when you
     stop, and turns round and walks back when you scroll up).
   - Standing still she turns to face you; at the very end she waves once.
   - She never takes clicks (pointer-events: none) and goes see-through
     while she's passing over the "Go back" link.
   - Reduced motion: just the bar. */
import { THREE, loadMiniMe, poser } from './mini-me-kit.js?v=12';

(function () {
  "use strict";
  const top = document.querySelector(".cs-top");
  if (!top) return;
  let canvas = null, renderer = null;
  const back = top.querySelector(".cs-back");

  /* the bar */
  const css = document.createElement("style");
  css.textContent = `
    .cs-progress { position: fixed; left: 0; right: 0; height: 3px; z-index: 52; pointer-events: none;
      background: var(--accent, #ec0077); transform-origin: 0 50%; transform: scaleX(0); }
    .cs-walker { position: fixed; left: 0; top: 0; width: 100%; z-index: 53; pointer-events: none;
      transition: opacity .25s ease; }`;
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.className = "cs-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  let lineY = 0;                                      // the bar's top edge (viewport px): the bottom of the top bar
  const place = () => { lineY = Math.round(top.getBoundingClientRect().height) - 3; bar.style.top = lineY + "px"; };
  place();
  const progress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };
  let p = progress();
  const paintBar = () => { bar.style.transform = `scaleX(${p})`; };
  paintBar();
  window.addEventListener("scroll", () => { p = progress(); paintBar(); }, { passive: true });
  window.addEventListener("resize", () => { place(); p = progress(); paintBar(); fit(); });

  if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

  /* her strip of canvas, over the top bar */
  const BODY = window.matchMedia("(max-width: 640px)").matches ? 32 : 40;
  try {
    canvas = document.createElement("canvas");
    canvas.className = "cs-walker";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.opacity = "0";
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
  } catch (e) { return; }
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -500, 500);
  cam.position.z = 200;
  let W = 1, H = 1;
  function fit() {
    if (!renderer) return;
    W = window.innerWidth; H = lineY + 6;
    canvas.style.height = H + "px";
    renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    cam.right = W; cam.bottom = -H; cam.updateProjectionMatrix();       // viewport px, y down = −y
  }

  // load her once the page itself has settled, so she never holds it up
  const go = () => loadMiniMe(BODY, (me) => {
    if (!me || !me.clips.hold) return;
    document.body.appendChild(canvas);
    fit();
    const { body, bones, mixer, clips } = me;
    scene.add(body);
    const P = poser(bones, body), W3 = P.W3;
    const walkClip = clips.hold;
    const A = { walk: mixer.clipAction(walkClip), idle: mixer.clipAction(clips.idle), wave: clips.wave && mixer.clipAction(clips.wave) };
    A.idle.play();
    // how far one loop of the walk carries her, at this size: steps follow the bar's tip
    mixer.update(0);
    const a = A.walk; a.reset().play(); a.time = 0; mixer.update(0); body.updateMatrixWorld(true);
    const z0 = W3("Hips").z; a.time = walkClip.duration - 0.001; mixer.update(0); body.updateMatrixWorld(true);
    const stride = Math.abs(W3("Hips").z - z0) || BODY * 0.8;            // px per loop
    a.stop(); A.idle.play();
    const R = new THREE.Vector3(0, 1, 0);

    /* x: where she is (follows the bar's tip); turn: facing; walking 0→1 */
    const S = { x: margin(), turn: 0, walking: 0, dir: 1 };
    let still = 0, waved = false, walking = false;
    function margin() { return BODY * 0.5; }
    const clock = new THREE.Clock();

    function frame() {
      const dt = Math.min(clock.getDelta(), 0.05);
      const target = Math.max(margin(), Math.min(W - margin(), p * W));
      const dx = (target - S.x) * Math.min(1, dt * 7);
      S.x += dx;
      const moving = Math.abs(dx) > 0.15;
      if (moving) {
        still = 0;
        if (Math.sign(dx) !== S.dir) S.dir = Math.sign(dx);
        if (!walking) { walking = true; A.walk.reset().play(); A.idle.crossFadeTo(A.walk, 0.2, false); }
      } else still += dt;
      // the walk only moves on as far as she travels (her feet keep pace with the bar)
      A.walk.timeScale = 0;
      A.walk.time = (A.walk.time + Math.abs(dx) / stride * walkClip.duration) % walkClip.duration;
      if (still > 0.25 && walking) { walking = false; A.idle.reset().play(); A.walk.crossFadeTo(A.idle, 0.35, false); }
      // face the way she's going; standing still, turn to you
      const want = still > 0.25 ? 0 : (S.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      S.turn += (want - S.turn) * Math.min(1, dt * 8);
      // the end: one wave
      if (!waved && A.wave && p > 0.995 && still > 0.4 && !walking) {
        waved = true;
        A.wave.reset().setLoop(THREE.LoopRepeat, 3).play(); A.wave.clampWhenFinished = true;
        A.idle.crossFadeTo(A.wave, 0.25, false);
        setTimeout(() => { A.idle.reset().play(); A.wave.crossFadeTo(A.idle, 0.6, false); }, (clips.wave.duration * 3 - 0.6) * 1000);
      }
      if (p < 0.9) waved = false;

      mixer.update(dt);
      body.rotation.set(0, S.turn, 0);
      body.position.set(0, 0, 0);
      body.updateMatrixWorld(true);
      // the carry walk holds her arms out: let them hang and swing instead
      const ph = Math.sin(A.walk.time / walkClip.duration * Math.PI * 2) * 0.35 * A.walk.getEffectiveWeight();
      if (A.walk.getEffectiveWeight() > 0.01) {
        const fwd = new THREE.Vector3(Math.sin(S.turn), 0, Math.cos(S.turn));
        for (const [side, s] of [["Left", 1], ["Right", -1]]) {
          const d = new THREE.Vector3(0, -1, 0).addScaledVector(fwd, ph * s).normalize();
          P.aim(bones[side + "Arm"], bones[side + "ForeArm"], d, A.walk.getEffectiveWeight());
          P.aim(bones[side + "ForeArm"], bones[side + "Hand"], d, A.walk.getEffectiveWeight());
        }
      }
      body.updateMatrixWorld(true);
      const soles = Math.min(W3("LeftToeBase").y, W3("RightToeBase").y) - BODY * 0.035;
      body.position.set(S.x - W3("Hips").x, -lineY - soles, 0);
      renderer.render(scene, cam);
      // see-through over the "Go back" link
      if (back) {
        const r = back.getBoundingClientRect();
        canvas.style.opacity = (S.x + BODY * 0.4 > r.left && S.x - BODY * 0.4 < r.right) ? "0.25" : "1";
      } else canvas.style.opacity = "1";
      requestAnimationFrame(frame);
    }
    if (/[?&]mmdebug/.test(location.search)) window.__walker = { S, A, get still() { return still; }, get walking() { return walking; } };
    clock.getDelta();
    requestAnimationFrame(frame);
  });
  if (document.readyState === "complete") setTimeout(go, 300);
  else window.addEventListener("load", () => setTimeout(go, 300));
})();
