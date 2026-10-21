/* Mini-me on Home, phones (≤ 860px).

   Peek-a-boo, once per load: she pops up from behind the torn paper at the
   bottom of the hero (top half showing), waves hi and ducks back down, and
   then the polaroid photo rises into its usual place and stays.

   If her model can't load, the polaroid is just shown as before. */
import { THREE, loadMiniMe, poser, introSeen, markIntroSeen } from './mini-me-kit.js?v=12';

(function () {
  "use strict";
  const stage = document.getElementById("stage-1");
  const photo = stage && stage.querySelector(".p1-photo-card");
  const strip = document.querySelector("#panel-1 .paper-strip--bottom");
  if (!stage || !photo || typeof gsap === "undefined") return;
  if (!window.matchMedia("(max-width: 860px) and (prefers-reduced-motion: no-preference)").matches) return;
  // back from a case study: the polaroid is already in its place
  if (introSeen("m1")) { photo.style.visibility = "visible"; return; }

  // the polaroid is hidden on phones by the stylesheet; it comes back if she can't
  let shown = false;
  const fallback = () => { if (!shown) { shown = true; photo.style.visibility = "visible"; if (canvas) canvas.remove(); } };
  const failTimer = setTimeout(fallback, 7000);

  /* her canvas: where the polaroid was, half as wide again (her arms) and a bit taller (her waving hand) */
  let canvas, renderer;
  try {
    canvas = document.createElement("canvas");
    canvas.className = "p1-mini-me";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
  } catch (e) { fallback(); return; }

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
  cam.position.z = 1000;
  const TOP_ROOM = 0.2;
  let W = 1, H = 1, PH = 1, edge = 0, cLeft = 0, cTop = 0;   // edge: the paper's torn edge, canvas px from the bottom (y up)
  /* the torn edge of the bottom paper, straight below her: the first solid pixel down the strip image */
  let stripScan = null;
  function edgeAt(clientX) {
    if (!strip || !strip.complete || !strip.naturalWidth) return null;
    const r = strip.getBoundingClientRect();
    try {
      if (!stripScan || stripScan.w !== Math.round(r.width)) {
        const w = Math.round(r.width), h = Math.round(r.height), cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const g = cv.getContext("2d"); g.drawImage(strip, 0, 0, w, h);
        stripScan = { w, h, g };
      }
      const x = Math.round(clientX - r.left), col = stripScan.g.getImageData(x, 0, 1, stripScan.h).data;
      for (let y = 0; y < stripScan.h; y++) if (col[y * 4 + 3] > 200) return r.top + y;
    } catch (e) { /* unreadable image: fall back below */ }
    return null;
  }
  function fit() {
    if (!canvas.isConnected) return;
    const sr = stage.getBoundingClientRect(), k = sr.width / stage.offsetWidth || 1, pr = photo.getBoundingClientRect();
    PH = Math.round(pr.height / k) || 1;
    W = Math.round(pr.width / k * 1.5) || 1; H = Math.round(PH * (1 + TOP_ROOM));
    cLeft = (pr.left - sr.left) / k - pr.width / k * 0.25; cTop = (pr.top - sr.top) / k - PH * TOP_ROOM;
    Object.assign(canvas.style, { left: cLeft + "px", top: cTop + "px", width: W + "px", height: H + "px" });
    const e = edgeAt(pr.left + pr.width / 2);
    edge = e == null ? H * 0.3 : H - (e - (pr.top - PH * TOP_ROOM * k)) / k;
    renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    cam.left = 0; cam.right = W; cam.top = H; cam.bottom = 0; cam.updateProjectionMatrix();
  }
  fit();

  loadMiniMe(1, (me) => {
    if (!me || !me.clips.wave) { fallback(); return; }
    clearTimeout(failTimer);
    shown = true;
    const { body, bones, mixer, clips } = me;
    scene.add(body);
    const P = poser(bones, body), W3 = P.W3;
    const A = { idle: mixer.clipAction(clips.idle), wave: mixer.clipAction(clips.wave) };
    A.idle.play();
    A.wave.clampWhenFinished = true;               // holds its last frame while it blends out (no snap)

    /* up 0→1: hidden below the paper → half out (hips at its torn edge); tilt: a cheeky lean */
    const S = { up: 0, tilt: 0 };
    const clock = new THREE.Clock();
    let running = false;

    function draw(dt) {
      body.scale.setScalar(PH * 0.95);               // as tall as the polaroid
      mixer.update(dt);
      body.rotation.set(0, 0, S.tilt);
      body.position.set(0, 0, 0);
      body.updateMatrixWorld(true);
      P.faceUser(1);                                 // looking out at you
      const hip = W3("Hips"), top = W3("HeadTop_End");
      const outY = edge - hip.y - PH * 0.02;         // hips just behind the torn edge: top half showing
      const hiddenY = edge - top.y - 24;             // head well below it
      body.position.set(W / 2 - hip.x, hiddenY + (outY - hiddenY) * S.up, 0);
      renderer.render(scene, cam);
    }
    function frame() {
      if (!running) return;
      draw(Math.min(clock.getDelta(), 0.05));
      requestAnimationFrame(frame);
    }
    /* once she's gone, the polaroid rises back into its place from behind the paper, and stays */
    function photoBack() {
      gsap.killTweensOf(photo);
      photo.style.visibility = "visible";
      gsap.fromTo(photo, { xPercent: -50, x: 0, y: PH * 0.55, rotation: -5, opacity: 0 },
        { y: 0, rotation: 0, opacity: 1, duration: 1.1, ease: "power3.out" });
    }
    function done() {
      running = false;
      renderer.dispose(); canvas.remove();
    }

    const waveFor = clips.wave.duration * 4;
    const intro = gsap.timeline({ paused: true })
      .to(S, { up: 1, duration: 0.8, ease: "back.out(1.3)" })
      .to(S, { tilt: -0.06, duration: 0.5, ease: "sine.inOut" }, "<0.25")
      .add(() => { A.wave.reset().setLoop(THREE.LoopRepeat, 4).play(); A.idle.crossFadeTo(A.wave, 0.35, false); }, "-=0.25")
      // ease the arm down over the last stroke, before the wave ends
      .add(() => { A.idle.reset().play(); A.wave.crossFadeTo(A.idle, 0.8, false); }, "+=" + (waveFor - 0.8))
      .to(S, { tilt: 0, duration: 0.5, ease: "sine.inOut" }, "+=0.2")
      // and back down behind the paper
      .to(S, { up: 0, duration: 0.7, ease: "power2.inOut" }, "+=0.3")
      .add(photoBack, "-=0.15")
      .add(done, "+=0.2");

    /* only animate while the hero is on screen */
    let started = false;
    const io = new IntersectionObserver((es) => {
      const visible = es[0].isIntersecting;
      if (visible && !running && intro.progress() < 1) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
      if (!visible) running = false;
      if (!started && visible) { started = true; gsap.delayedCall(0.8, () => { fit(); markIntroSeen("m1"); intro.play(0); }); }
      if (intro.progress() === 1) io.disconnect();
    });
    io.observe(canvas);
    window.addEventListener("resize", fit);
    if (/[?&]mmdebug/.test(location.search)) window.__miniMeM1 = { S, A, intro, P,
      step: (tl, t) => { fit(); running = false; tl.pause(); for (let k = 0; k < t / 0.02; k++) { tl.time(tl.time() + 0.02); draw(0.02); } } };
  });
})();
