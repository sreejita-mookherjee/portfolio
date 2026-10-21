/* Mini-me on Contact (desktop only).

   The Behance pill hangs crooked. The first time the page comes up she
   walks in from the right carrying a ladder, tips it up under the pill,
   climbs up ("Climbing Ladder"), straightens it, climbs back down, picks
   the ladder up and walks off. Once per load.

   - She carries the ladder side-on with "Holding Walk", and sidesteps
     ("Right Strafe Walk") between it and the spot she put it down.
   - If her model can't load, the pill just straightens itself. */
import { THREE, makeStageScene, loadMiniMe, poser, rootTravel, whenPage, introSeen, markIntroSeen } from './mini-me-kit.js?v=12';

(function () {
  "use strict";
  const panel = document.getElementById("panel-5");
  const stage = document.getElementById("stage-5");
  const links = stage && stage.querySelector(".p5-links");
  const pill = links && [...links.querySelectorAll(".p5-link")].find((a) => /behance/i.test(a.href || a.textContent));
  if (!panel || !stage || !pill || typeof gsap === "undefined") return;
  if (!window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)").matches) return;

  // crooked, hanging off its left end, until she fixes it
  gsap.set(pill, { rotation: 11, transformOrigin: "12% 50%" });
  const straighten = (d = 0.7) => gsap.to(pill, { rotation: 0, duration: d, ease: "elastic.out(1, 0.45)" });

  const BODY = 170;            // her height, stage px
  let sc;
  try { sc = makeStageScene(stage, 9); } catch (e) { straighten(); return; }
  const { scene, T, render } = sc;

  /* the ladder: two rails + rungs, origin at its bottom centre, standing along +y */
  const LAD_H = 300, LAD_W = 56;
  const ladder = new THREE.Group();
  {
    const wood = new THREE.MeshLambertMaterial({ color: 0xc8935c });
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(7, LAD_H, 7), wood);
      rail.position.set(sx * LAD_W / 2, LAD_H / 2, 0);
      ladder.add(rail);
    }
    for (let y = 26; y < LAD_H - 8; y += 34) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, LAD_W, 8), wood);
      rung.rotation.z = Math.PI / 2; rung.position.set(0, y, 0);
      ladder.add(rung);
    }
  }
  scene.add(ladder);
  ladder.visible = false;

  /* where things go (stage px): the pill, the floor, the ladder's foot */
  const geo = { floor: 0, ladX: 0, pillX: 0, pillY: 0, pillBottom: 0 };
  function measure() {
    const sr = stage.getBoundingClientRect(), k = sr.width / stage.offsetWidth || 1;
    const lx = links.offsetLeft + pill.offsetLeft, ly = links.offsetTop + pill.offsetTop;
    geo.pillX = lx + pill.offsetWidth / 2; geo.pillY = ly + pill.offsetHeight / 2; geo.pillBottom = ly + pill.offsetHeight;
    const strip = panel.querySelector(".paper-strip--bottom");
    const edge = strip ? (strip.getBoundingClientRect().top - sr.top) / k + 40 : 900;
    geo.floor = Math.min(edge, 930);
    geo.ladX = geo.pillX + 40;
  }

  loadMiniMe(BODY, (me) => {
    if (!me || !me.clips.ladder || !me.clips.strafe || !me.clips.hold) { straighten(); return; }
    const { body, bones, mixer, clips, soleDrop } = me;
    scene.add(body);
    const P = poser(bones, body);
    const hold = clips.hold;
    const A = { carry: mixer.clipAction(hold), step: mixer.clipAction(clips.strafe), climb: mixer.clipAction(clips.ladder), idle: mixer.clipAction(clips.idle) };
    // "Holding Walk" walks forward (she turns side-on to travel); "Right Strafe Walk" sidesteps facing us.
    // Their natural pace (stage px / s), so her feet don't slide
    const hd = rootTravel(mixer, hold, body, bones);
    const hSpeed = Math.hypot(hd.x, hd.z) / hold.duration || 80;
    const LEFT = hd.z >= 0 ? -Math.PI / 2 : Math.PI / 2;           // body yaw that walks her screen-left
    const sd = rootTravel(mixer, clips.strafe, body, bones);
    const sSpeed = Math.abs(sd.x) / clips.strafe.duration || 60;
    const leftDir = sd.x <= 0 ? 1 : -1;                              // strafe time scale sign that moves her screen-left
    const climbRise = Math.abs(rootTravel(mixer, clips.ladder, body, bones).y) || BODY * 0.25;
    const climbSpeed = climbRise / clips.ladder.duration;            // stage px / s, matching the clip's own pace
    // where her hands are, relative to her hips, in a clip's first frame at a given yaw
    function handsOff(clip, turn) {
      const a = mixer.clipAction(clip); a.reset().play(); a.time = 0; mixer.update(0);
      body.rotation.set(0, turn, 0); body.position.set(0, 0, 0); body.updateMatrixWorld(true);
      const dx = (P.W3("LeftHand").x + P.W3("RightHand").x) / 2 - P.W3("Hips").x;
      a.stop(); return dx;
    }

    /* x: her hips (stage px) on the floor; feet: how high her soles are (stage px, up from the floor)
       turn: body yaw; carry 1→0: ladder in her hands → standing; reach 0→1: arm up to the pill */
    const S = { x: 0, feet: 0, turn: LEFT, carry: 1, reach: 0 };
    const clock = new THREE.Clock();
    let running = false, ladLen = LAD_H;

    function draw(dt) {
      mixer.update(dt);
      body.rotation.set(0, S.turn, 0);
      body.position.set(0, 0, 0);
      body.updateMatrixWorld(true);
      if (S.reach > 0) {
        // the arm nearer the pill goes up to it, hand pressed under its end
        const side = P.W3("LeftArm").x < P.W3("RightArm").x ? "Left" : "Right";
        const to = new THREE.Vector3(THREE.MathUtils.clamp(((geo.pillX - 50) - geo.ladX) * 0.004, -0.4, 0.4), 1, -0.05).normalize();
        P.aim(bones[side + "Arm"], bones[side + "ForeArm"], to, S.reach);
        P.aim(bones[side + "ForeArm"], bones[side + "Hand"], to, S.reach);
      }
      // pin: hips at S.x, soles S.feet above the floor
      body.updateMatrixWorld(true);
      const soles = Math.min(P.W3("LeftToeBase").y, P.W3("RightToeBase").y) - soleDrop;
      body.position.x = S.x - P.W3("Hips").x;
      body.position.y = -(geo.floor - S.feet) - soles;
      body.position.z = 20;
      body.updateMatrixWorld(true);
      // the ladder: carried flat at her side (centred on her hands), or standing under the pill;
      // in between it pivots on its foot
      const stand = T(geo.ladX, geo.floor, -45);                    // behind her: she climbs with her back to us
      if (S.carry > 0) {
        const h = P.W3("LeftHand").add(P.W3("RightHand")).multiplyScalar(0.5);
        const held = new THREE.Vector3(h.x - ladLen / 2, h.y, 40);
        ladder.position.copy(stand).lerp(held, S.carry);
        ladder.rotation.set(0, 0, -Math.PI / 2 * S.carry);
      } else {
        ladder.position.copy(stand);
        ladder.rotation.set(0, 0, 0);
      }
      render();
    }
    function frame() {
      if (!running) return;
      draw(Math.min(clock.getDelta(), 0.05));
      requestAnimationFrame(frame);
    }
    const walk = (a, ts, from) => { a.reset().setEffectiveTimeScale(ts).play(); if (from) from.crossFadeTo(a, 0.35, false); };

    whenPage(4, () => {
      // back from a case study: she's fixed it already
      if (introSeen("p5")) { gsap.set(pill, { rotation: 0 }); sc.canvas.remove(); sc.renderer.dispose(); return; }
      markIntroSeen("p5");
      measure();
      ladder.scale.y = Math.min(1.2, (geo.floor - geo.pillBottom - 22) / LAD_H);   // its top stops short of the pill
      ladLen = LAD_H * ladder.scale.y;
      // she stops with the ladder's front end right where it'll stand, then sidesteps over to it;
      // coming back she sidesteps to its middle, so it lowers straight into her hands
      const stopX = geo.ladX + ladLen / 2 - handsOff(hold, LEFT);
      const pickX = geo.ladX + ladLen / 2 - handsOff(A.idle.getClip(), -LEFT);
      const sideIn = (stopX - geo.ladX) / sSpeed, sideOut = (pickX - geo.ladX) / sSpeed;
      S.x = 1726 + BODY * 0.6; ladder.visible = true;
      const walkIn = 4.2, inTs = THREE.MathUtils.clamp((S.x - stopX) / walkIn / hSpeed, 0.7, 2.2);
      const outDist = 1726 + BODY * 1.6 - pickX, outDur = outDist / (hSpeed * inTs);
      walk(A.carry, inTs);
      running = true; clock.getDelta(); requestAnimationFrame(frame);
      const climbTo = geo.floor - geo.pillBottom - BODY * 1.02;   // her hands just reach under the pill
      const up = Math.max(0.8, climbTo / climbSpeed);
      const tl = gsap.timeline({ delay: 1.2 });
      tl
        // in from the right, ladder at her side
        .to(S, { x: stopX, duration: walkIn, ease: "none" })
        .add(() => { A.idle.reset().play(); A.carry.crossFadeTo(A.idle, 0.4, false); })
        // tip the ladder up on its foot, turning to us
        .to(S, { carry: 0, duration: 1.1, ease: "power2.inOut" }, "+=0.15")
        .to(S, { turn: 0, duration: 0.7, ease: "sine.inOut" }, "<0.2")
        // a few sidesteps over to it
        .add(() => walk(A.step, leftDir, A.idle), "+=0.1")
        .to(S, { x: geo.ladX, duration: sideIn, ease: "none" }, "<")
        // onto the ladder and up (the climb clip itself faces the ladder: back to us)
        .add(() => { A.climb.reset().setEffectiveTimeScale(1).play(); A.step.crossFadeTo(A.climb, 0.45, false); })
        .to(S, { feet: climbTo, duration: up, ease: "none" }, "<0.15")
        // at the top: reach up and set it straight
        .add(() => { A.climb.paused = true; })
        .to(S, { reach: 1, duration: 0.4, ease: "sine.out" })
        .add(() => straighten(0.9))
        .to(S, { reach: 0, duration: 0.4, ease: "sine.in" }, "+=0.7")
        // back down
        .add(() => { A.climb.paused = false; A.climb.setEffectiveTimeScale(-1); })
        .to(S, { feet: 0, duration: up * 0.85, ease: "none" })
        .add(() => { A.idle.reset().play(); A.climb.crossFadeTo(A.idle, 0.45, false); })
        // sidestep back to the ladder's middle, turn to face the way out
        .add(() => walk(A.step, -leftDir, A.idle), "+=0.35")
        .to(S, { x: pickX, duration: sideOut, ease: "none" }, "<")
        .add(() => { A.idle.reset().play(); A.step.crossFadeTo(A.idle, 0.3, false); })
        .to(S, { turn: -LEFT, duration: 0.6, ease: "sine.inOut" })
        // lower it on its foot into her hands, and walk off the way she came
        .to(S, { carry: 1, duration: 1.1, ease: "power2.inOut" }, "-=0.1")
        .add(() => walk(A.carry, inTs, A.idle), "+=0.1")
        .to(S, { x: pickX + outDist, duration: outDur, ease: "none" }, "<0.15")
        .add(() => { running = false; sc.canvas.remove(); sc.renderer.dispose(); });
      if (/[?&]mmdebug/.test(location.search)) window.__miniMeP5 = { S, geo, A, P, tl,
        step: (t) => { running = false; tl.pause(); for (let k = 0; k < t / 0.02; k++) { tl.time(tl.time() + 0.02); draw(0.02); } } };
    });
  });
})();
