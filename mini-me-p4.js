/* Mini-me on My Journey (desktop only).

   Peek-a-boo: she pops up from behind the torn paper strip at the bottom
   of the page, half out, waves hi, and ducks back down. Ten seconds
   later she does it again, for as long as the page is showing. */
import { THREE, makeStageScene, loadMiniMe, poser } from './mini-me-kit.js?v=12';

(function () {
  "use strict";
  const panel = document.getElementById("panel-4");
  const stage = document.getElementById("stage-4");
  const title = stage && stage.querySelector(".p4-my");
  const strip = panel && panel.querySelector(".paper-strip--bottom");
  if (!panel || !stage || !title || !strip || typeof gsap === "undefined") return;
  if (!window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)").matches) return;

  const BODY = 175;            // her height, stage px
  let sc;
  try { sc = makeStageScene(stage, 7); } catch (e) { return; }   // under the paper strip (z 20), so it hides her lower half
  const { scene, render } = sc;

  /* where she peeks: under "My Journey", lined up with where it starts, from behind the strip's torn edge */
  const geo = { x: 0, edge: 0 };
  function measure() {
    const sr = stage.getBoundingClientRect(), k = sr.width / stage.offsetWidth || 1;
    geo.x = title.offsetLeft + BODY * 0.2;          // her left side level with the "M" 
    const r = strip.getBoundingClientRect();
    geo.edge = (r.top - sr.top) / k + (r.height / k) * 0.55;   // the torn edge (just over half way down the strip image), stage px
  }

  loadMiniMe(BODY, (me) => {
    if (!me || !me.clips.wave) return;
    const { body, bones, mixer, clips } = me;
    scene.add(body);
    const A = { idle: mixer.clipAction(clips.idle), wave: mixer.clipAction(clips.wave) };
    A.idle.play();
    A.wave.clampWhenFinished = true;                 // holds its last frame while it blends out (no snap)
    const P = poser(bones, body), W3 = P.W3;

    /* up 0→1: hidden below the edge → hips level with it (half out); tilt: a cheeky lean */
    const S = { up: 0, tilt: 0 };
    const clock = new THREE.Clock();
    let running = false;

    function draw(dt) {
      mixer.update(dt);
      body.rotation.set(0, 0, S.tilt);
      body.position.set(0, 0, 0);
      body.updateMatrixWorld(true);
      P.faceUser(1);                                   // looking straight out at you
      const hip = W3("Hips"), top = W3("HeadTop_End");
      const hidden = geo.edge + (top.y - hip.y) + 40;       // head well below the edge
      const out = geo.edge + BODY * 0.04;                   // hips at the edge: top half showing
      body.position.set(geo.x - hip.x, -(hidden + (out - hidden) * S.up) - hip.y, 0);
      render();
    }
    function frame() {
      if (!running) return;
      draw(Math.min(clock.getDelta(), 0.05));
      requestAnimationFrame(frame);
    }

    const waveFor = clips.wave.duration * 4;
    const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 10, onRepeat: measure })
      .to(S, { up: 1, duration: 0.55, ease: "back.out(1.6)" })
      .to(S, { tilt: -0.08, duration: 0.4, ease: "sine.inOut" }, "<0.2")
      .add(() => { A.wave.reset().setLoop(THREE.LoopRepeat, 4).play(); A.idle.crossFadeTo(A.wave, 0.25, false); }, "-=0.2")
      // ease the arm down over the last stroke, before the wave ends
      .add(() => { A.idle.reset().play(); A.wave.crossFadeTo(A.idle, 0.7, false); }, "+=" + (waveFor - 0.7))
      .to(S, { tilt: 0, duration: 0.4, ease: "sine.inOut" }, "+=0.6")
      .to(S, { up: 0, duration: 0.4, ease: "power2.in" }, "<0.1");
    let delay = null;

    function show(on) {
      if (on && !running) {
        measure();
        running = true; clock.getDelta(); requestAnimationFrame(frame);
        tl.pause(0);
        delay = gsap.delayedCall(1.2, () => { measure(); tl.play(0); });   // measured again once the page has flipped in
      } else if (!on && running) {
        running = false;
        if (delay) delay.kill();
        tl.pause(0);
      }
    }
    // until the page has loaded the scroll position is still being restored: go by the URL
    show(window.__flipLoaded ? window.__panelIndex === 3 : /^#journey$/i.test(location.hash));
    window.addEventListener("panelchange", (e) => { if (window.__flipLoaded) show(e.detail.index === 3); });
    window.addEventListener("resize", () => { if (running) measure(); });
    if (/[?&]mmdebug/.test(location.search)) window.__miniMeP4 = { S, geo, A, tl,
      step: (t) => { measure(); running = false; if (delay) delay.kill(); tl.pause(); for (let k = 0; k < t / 0.02; k++) { tl.time(tl.time() + 0.02); draw(0.02); } } };
  });
})();
