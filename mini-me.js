/* Mini-me on Home (desktop only).

   1. Intro: a tiny 3D Sreejita comes down a silk line (left hand on the
      line, like before) onto "Sreejita", lets go, drops onto the top edge
      of the name and sits there, legs dangling and swinging, while the
      line zips back up; she waves hi once.
   2. She stays sitting there. Every time Home is come back to, she swings
      her legs and waves hi again.
   3. 3.5s after she's settled, the "Scroll to continue" hint is allowed to
      show (scroll-hint.js waits for us — see __scrollHintRelease); while it
      is up she points down at it now and then.

   - The hero photo is hidden here (desktop only — mobile keeps it, and has
     no mini-me).
   - The canvas lives INSIDE #stage-1, so it inherits the stage's cover
     scaling and flips away with page 1 (all maths in stage px, the
     1726×996 Figma frame).
   - She's rendered UNLIT (MeshBasicMaterial): the Tripo texture already
     has its shading painted in.
   - Any failure (no WebGL, model 404, slow load) just lets the scroll hint
     and the waving-hand badge run as before. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { introSeen, markIntroSeen } from './mini-me-kit.js?v=12';

(function () {
  "use strict";
  const stage = document.getElementById("stage-1");
  const panel = document.getElementById("panel-1");
  const name1 = stage && stage.querySelector(".headline-first");
  const name2 = stage && stage.querySelector(".headline-second");
  const hint = document.getElementById("scrollHint");
  if (!stage || !panel || !name1 || !name2 || typeof gsap === "undefined") return;
  if (!window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)").matches) return;

  const holdHint = () => window.__scrollHintHold && window.__scrollHintHold();
  const releaseHint = (ms) => window.__scrollHintRelease && window.__scrollHintRelease(ms);
  holdHint();

  // no hero photo next to her
  const photo = stage.querySelector(".p1-photo-card");
  if (photo) { gsap.killTweensOf(photo); photo.style.display = "none"; }

  /* the waving-hand badge waits too: it pops in (and its wave starts from
     the top) only once she has landed and said hi */
  const sphere = stage.querySelector(".sphere");
  const waveHand = sphere && sphere.querySelector(".sphere-hand");
  if (sphere) { gsap.killTweensOf(sphere); gsap.set(sphere, { opacity: 0 }); }
  let waveShown = false;
  function showWave() {
    if (waveShown || !sphere) return; waveShown = true;
    // a fresh URL restarts the SVG's own wave animation from its first frame
    if (waveHand) waveHand.src = waveHand.getAttribute("src").split("?")[0] + "?w=" + Date.now();
    gsap.fromTo(sphere, { opacity: 0, scale: 0.3, rotation: -25 },
      { opacity: 1, scale: 1, rotation: 0, duration: 0.65, ease: "back.out(1.7)" });
  }
  let bailed = false, ready = false;
  function bail() { if (bailed) return; bailed = true; showWave(); releaseHint(); teardown(); }
  const bailTimer = setTimeout(() => { if (!ready) bail(); }, 7000);

  /* ---------------- where things go (stage px) ---------------- */
  const BODY = 235;                // her standing height
  const CW = 1726, CH = 996;       // the whole stage
  const geo = { seatX: 0, seatY: 0, ropeX: 0 };
  // a headline's cap-top line and where its letters end (stage px)
  function capsOf(el) {
    const cs = getComputedStyle(el);
    const g = document.createElement("canvas").getContext("2d");
    g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = g.measureText(el.textContent.trim().toUpperCase());
    const lineBox = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    const top = lineBox
      ? el.offsetTop + (el.offsetHeight - lineBox) / 2 + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent
      : el.offsetTop + el.offsetHeight * 0.22;
    return { top, right: el.offsetLeft + (m.width || el.offsetWidth) };
  }
  // she sits on top of "Mookherjee", just past the end of "Sreejita" above it
  function measure() {
    const a = capsOf(name1), b = capsOf(name2);
    geo.seatX = Math.min(a.right + BODY * 0.42, b.right - 60);
    geo.seatY = b.top;
    geo.ropeX = geo.seatX + 14;    // the line comes down just above her spot
  }

  /* ---------------- renderer ---------------- */
  const DPR = window.devicePixelRatio || 1;
  const stageScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stage-scale")) || 1;
  let renderer;
  try {
    const c = document.createElement("canvas");
    c.className = "mini-me-canvas";
    c.setAttribute("aria-hidden", "true");
    Object.assign(c.style, { position: "absolute", left: "0px", top: "0px", width: CW + "px", height: CH + "px",
      zIndex: "7", pointerEvents: "none", opacity: "0" });
    stage.appendChild(c);
    renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
  } catch (e) { clearTimeout(bailTimer); bail(); return; }
  renderer.setClearColor(0x000000, 0);
  function fit() {
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(2.5, DPR * stageScale() * 1.4));
    renderer.setSize(CW, CH, false);
  }
  fit();
  window.addEventListener("resize", () => { fit(); if (ready) measure(); });

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9c, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-0.5, 1, 0.9); scene.add(sun);
  const cam = new THREE.OrthographicCamera(0, CW, 0, -CH, -2000, 2000);   // stage px, y up
  cam.position.z = 1000;
  const T = (x, y, z = 0) => new THREE.Vector3(x, -y, z);                    // stage → scene
  const body = new THREE.Group();
  scene.add(body);

  /* ---------------- the silk line ---------------- */
  const ANCHOR_Y = -80;            // anchored above the stage top
  const SEAT_TURN = 0;             // seated facing straight out at the visitor
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x262626, transparent: true, opacity: 0.6 }));
  scene.add(rope);
  const _up = new THREE.Vector3(0, 1, 0);
  function stretch(mesh, a, b) {
    const d = b.clone().sub(a);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.scale.set(1, Math.max(d.length(), 0.001), 1);
    mesh.quaternion.setFromUnitVectors(_up, d.normalize());
  }

  /* ---------------- posing helpers ---------------- */
  let mixer, bones = {}, A = {}, soleDrop = 0;
  const indexF = [], curlF = [];   // pointing: index straight, the rest in a fist
  const _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  /* aim `bone` so the direction to `child` points along `dir` (world) */
  function aim(bone, child, dir, f = 1) {
    if (f <= 0) return;
    const cur = child.getWorldPosition(_b).sub(bone.getWorldPosition(_a)).normalize();
    _q.setFromUnitVectors(cur, dir);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.slerp(_pq.invert().multiply(_q.multiply(_wq)), f);
    bone.updateMatrixWorld(true);
  }
  const _rq = new THREE.Quaternion();
  function rotAbout(bone, axis, angle) {
    _rq.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_rq.multiply(_wq)));
    bone.updateMatrixWorld(true);
  }
  const W3 = (k) => bones[k].getWorldPosition(new THREE.Vector3());
  const _bq = new THREE.Quaternion(), _look = new THREE.Vector3();
  function lookAtViewer(f) {
    body.getWorldQuaternion(_bq);
    _look.set(0, 1, 0).applyQuaternion(_bq).add(new THREE.Vector3(0, 0, 0.25)).normalize();
    aim(bones.Neck, bones.Head, _look, f);
    aim(bones.Head, bones.HeadTop_End, _look, f);
  }

  /* ---------------- model ---------------- */
  const tex = new THREE.TextureLoader().load("assets/mini-me/mini-me-color.jpg?v=2");
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  /* no mipmaps: the texture is hundreds of tiny UV islands, and at her
     tiny on-screen size the blurred mip levels bled dark hair/denim
     into everything, making her look dimmer than she is */
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;

  new GLTFLoader().load("assets/mini-me/mini-me.glb?v=11", (gltf) => {
    clearTimeout(bailTimer);
    if (bailed) return;
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ map: tex }); o.frustumCulled = false; }
      if (o.isBone) {
        if (/RightHandIndex[123]$/.test(o.name)) indexF.push({ b: o, rest: o.quaternion.clone() });
        if (/RightHand(Middle|Ring|Pinky|Thumb)[123]$/.test(o.name)) curlF.push({ b: o, rest: o.quaternion.clone() });
        for (const k of ["Hips", "Neck", "Head", "HeadTop_End", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm",
                         "LeftHand", "RightHand", "LeftLeg", "RightLeg", "LeftToeBase", "RightToeBase"]) {
          if (o.name.endsWith(k) && !o.name.endsWith("Up" + k)) bones[k] = o;
        }
      }
    });
    const clip = (n) => gltf.animations.find((c) => c.name === n);
    const hang = clip("hang"), ledge = clip("ledge");
    if (!hang || !ledge) { bail(); return; }
    // pointing hand: the rope grip pushed into a tight fist
    const grip = clip("hang");
    for (const f of curlF) {
      const tr = grip && grip.tracks.find((t) => t.name === f.b.name + ".quaternion");
      if (!tr) { f.fist = f.rest.clone(); continue; }
      const d = new THREE.Quaternion().fromArray(tr.values, 0).multiply(f.rest.clone().invert());
      f.fist = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), d, /Thumb/.test(f.b.name) ? 1.4 : 2.1).multiply(f.rest);
    }

    const holder = new THREE.Group();
    holder.add(model);
    model.updateMatrixWorld(true);
    const unit = 1 / (() => { const s = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z); })();   // her height, whichever way the rest pose lies
    mixer = new THREE.AnimationMixer(model);
    A.hang = mixer.clipAction(hang);
    A.ledge = mixer.clipAction(ledge);
    // "Waving": just the waving arm's tracks, layered over whatever she's doing
    const wave = clip("wave");
    if (wave) {
      const swing = (side) => {           // how much that arm moves in the clip
        const tr = wave.tracks.find((t) => new RegExp(side + "ForeArm\\.quaternion$").test(t.name));
        if (!tr) return 0;
        const q0 = new THREE.Quaternion().fromArray(tr.values, 0), q = new THREE.Quaternion();
        let m = 0;
        for (let i = 4; i < tr.values.length; i += 4) { q.fromArray(tr.values, i); m = Math.max(m, q0.angleTo(q)); }
        return m;
      };
      const side = swing("Left") >= swing("Right") ? "Left" : "Right";
      const armOnly = new THREE.AnimationClip("waveArm", wave.duration,
        wave.tracks.filter((t) => new RegExp(side + "(Shoulder|Arm|ForeArm|Hand)[A-Za-z0-9]*\\.quaternion$").test(t.name)));
      A.wave = mixer.clipAction(armOnly);
      A.waveSide = side;
    }
    A.hang.play(); mixer.update(0);
    holder.updateMatrixWorld(true);
    /* face the camera, measured on the ANIMATED pose: the Mixamo clips
       carry a 90° base rotation the rest pose doesn't */
    const P = (k) => bones[k].getWorldPosition(new THREE.Vector3());
    const up = P("Head").sub(P("Hips")).normalize();
    const left = P("LeftArm").sub(P("RightArm"));
    left.sub(up.clone().multiplyScalar(left.dot(up))).normalize();
    const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
    holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd).invert());
    holder.scale.setScalar(unit);
    holder.updateMatrixWorld(true);
    holder.position.sub(P("Hips"));     // hips at the body's origin
    body.add(holder);
    body.scale.setScalar(BODY);
    soleDrop = BODY * 0.035;
    ready = true;
    // the name's position depends on its web font, so wait for that before measuring
    // and only once Home is actually showing (a refresh on another section starts her when you come back)
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
      // (until the page has loaded, the scroll position is still being restored: go by the URL)
      const onHome = window.__flipLoaded ? window.__panelIndex === 0 : !/^#(work|about|journey|contact)$/i.test(location.hash);
      if (onHome) start();
      else window.addEventListener("panelchange", function go(e) {
        if (e.detail.index === 0 && window.__flipLoaded) { window.removeEventListener("panelchange", go); start(); }
      });
    });
  }, undefined, () => { clearTimeout(bailTimer); bail(); });

  /* ---------------- frame ---------------- */
  /* handY: her hand on the line (stage px); sway: swing on the line (deg)
     hop 0→1: from hanging on the line to sitting on the name
     ropeY: where the line ends once she's let go (it zips back up)
     legs: how much her dangling legs swing; wave 0→1; point 0→1 */
  const S = { handY: -260, sway: 0, hop: 0, sit: 0, ropeY: null, legs: 0, wave: 0, point: 0, t: 0, brace: 0, braceWave: 1 };
  const clock = new THREE.Clock();
  let running = false, firstFrame = true;
  const _side = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

  function frame() {
    if (!running || !renderer) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    S.t += dt;
    mixer.update(dt);

    body.rotation.set(0, SEAT_TURN * S.sit, THREE.MathUtils.degToRad(S.sway) * (1 - S.hop));
    body.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    lookAtViewer(0.8);
    // body sits three-quarter, but her face turns round to look straight out at us
    if (S.sit > 0) {
      rotAbout(bones.Neck, _Y, -SEAT_TURN * 0.4 * S.sit);
      rotAbout(bones.Head, _Y, -SEAT_TURN * 0.55 * S.sit);
    }
    body.getWorldQuaternion(_bq);
    _side.set(1, 0, 0).applyQuaternion(_bq);

    // on the line: left hand straight up it, the other arm relaxed
    if (S.hop < 1) {
      aim(bones.LeftArm, bones.LeftForeArm, new THREE.Vector3(0.04, 1, 0).normalize(), 1 - S.hop);
      aim(bones.LeftForeArm, bones.LeftHand, new THREE.Vector3(0.04, 1, 0).normalize(), 1 - S.hop);
      aim(bones.RightArm, bones.RightForeArm, new THREE.Vector3(-0.25, -1, 0.1).normalize(), 1 - S.hop);
      aim(bones.RightForeArm, bones.RightHand, new THREE.Vector3(-0.15, -1, 0.2).normalize(), 1 - S.hop);
    }
    // dangling legs swinging (only once she's sitting)
    if (S.sit > 0.5) {
      const k = S.legs * Math.min(1, (S.sit - 0.5) * 2);
      rotAbout(bones.LeftLeg, _side, Math.sin(S.t * 4.2) * 0.45 * k);
      rotAbout(bones.RightLeg, _side, Math.sin(S.t * 4.2 + 2.4) * 0.45 * k);
    }
    // waving hi with her left hand (screen right)
    if (S.wave > 0) {
      const a = Math.sin(S.t * 11) * 0.5;
      aim(bones.LeftArm, bones.LeftForeArm, new THREE.Vector3(0.62, 0.6, 0.2).normalize(), S.wave);
      aim(bones.LeftForeArm, bones.LeftHand, new THREE.Vector3(Math.sin(a) + 0.15, Math.cos(a), 0.15).normalize(), S.wave);
    }
    // pointing down at the scroll hint with her right hand, one finger out
    if (S.point > 0 && pointDir) {
      aim(bones.RightArm, bones.RightForeArm, pointDir, S.point);
      aim(bones.RightForeArm, bones.RightHand, pointDir, S.point);
      for (const f of indexF) { f.b.quaternion.slerp(f.rest, S.point); f.b.updateMatrixWorld(true); }
      for (const f of curlF) { f.b.quaternion.slerp(f.fist, S.point); f.b.updateMatrixWorld(true); }
    }

    // place her: left hand on the line → standing on the name → hips on its top edge
    scene.updateMatrixWorld(true);
    const lh = W3("LeftHand"), hips = W3("Hips");
    const feet = Math.min(W3("LeftToeBase").y, W3("RightToeBase").y) - soleDrop;
    const onLine = T(geo.ropeX, S.handY).sub(new THREE.Vector3(lh.x, lh.y, 0));
    const standing = T(geo.seatX, geo.seatY).sub(new THREE.Vector3(hips.x, feet, 0));
    const sitting = T(geo.seatX, geo.seatY - 4).sub(new THREE.Vector3(hips.x, hips.y, 0));
    void standing;
    body.position.copy(onLine.lerp(sitting, S.sit));
    body.position.z = 2;
    scene.updateMatrixWorld(true);

    // sitting: hands planted on the top of the letters either side of her, taking her weight
    if (S.brace > 0) {
      const hp = W3("Hips"), top = -geo.seatY;
      for (const side of ["Left", "Right"]) {
        let w = S.brace;
        if (side === A.waveSide) w *= S.braceWave;
        if (side === "Right") w *= 1 - S.point;
        if (w <= 0) continue;
        const sh = W3(side + "Arm");
        const tgt = new THREE.Vector3(hp.x + (side === "Left" ? 1 : -1) * BODY * 0.2, top + BODY * 0.01, hp.z + BODY * 0.04);
        const mid = sh.clone().lerp(tgt, 0.5).add(new THREE.Vector3((side === "Left" ? 1 : -1) * BODY * 0.05, 0, 0));
        aim(bones[side + "Arm"], bones[side + "ForeArm"], mid.sub(sh).normalize(), w);
        const el = W3(side + "ForeArm");
        aim(bones[side + "ForeArm"], bones[side + "Hand"], tgt.clone().sub(el).normalize(), w);
      }
      scene.updateMatrixWorld(true);
    }

    // her box (stage px) for hovering, and the bubble just to her right
    if (settled) {
      const pts = ["HeadTop_End", "Hips", "LeftToeBase", "RightToeBase", "LeftHand", "RightHand"].map(W3);
      const xs = pts.map((p) => p.x), ys = pts.map((p) => -p.y);
      herBox = { l: Math.min(...xs) - 10, r: Math.max(...xs) + 10, t: Math.min(...ys) - 10, b: Math.max(...ys) + 6 };
      bubble.style.left = (herBox.r + 6) + "px";
      bubble.style.top = (herBox.t + 14) + "px";
    }

    // the line: down to her hand while she holds it, then zipping back up
    const end = S.ropeY == null ? W3("LeftHand") : T(geo.ropeX, S.ropeY, 2);
    rope.visible = end.y < -ANCHOR_Y - 1;
    if (rope.visible) stretch(rope, T(geo.ropeX, ANCHOR_Y, 2), end);

    renderer.render(scene, cam);
    if (firstFrame) { firstFrame = false; requestAnimationFrame(() => { if (renderer) renderer.domElement.style.opacity = "1"; }); }
    requestAnimationFrame(frame);
  }
  function run() { if (!running && renderer && ready) { running = true; clock.getDelta(); requestAnimationFrame(frame); } }

  // a little pendulum rock
  function rock(amp, dur) {
    const o = { t: 0 };
    return gsap.to(o, { t: dur, duration: dur, ease: "none",
      onUpdate: () => { S.sway = amp * Math.sin(o.t * 3.2) * Math.max(0, 1 - o.t / dur); } });
  }

  let settled = false, sayingHi = null;
  /* wave hi once, when she has just sat down (not again until a refresh) */
  function hello() {
    // the "Waving" clip's arm, a few strokes, once (weighted well over the sitting loop)
    if (!A.wave) return;
    const reps = 3;
    const dur = A.wave.getClip().duration * reps;
    A.wave.reset().setLoop(THREE.LoopRepeat, reps).setEffectiveWeight(8).fadeIn(0.3).play();
    gsap.timeline().to(S, { braceWave: 0, duration: 0.3 }).to(S, { braceWave: 1, duration: 0.5 }, dur - 0.2);
    setTimeout(() => A.wave.fadeOut(0.4), Math.max(0, dur - 0.4) * 1000);
  }

  function start() {
    measure();
    if (introSeen("p1")) {           // back from a case study: she's already sitting on the name
      Object.assign(S, { handY: geo.seatY - BODY * 0.62, ropeY: ANCHOR_Y - 10, sit: 1, hop: 1, brace: 1 });
      A.hang.stop(); A.ledge.reset().setEffectiveWeight(1).play();
      settled = true; run(); showWave(); releaseHint(1500);
      return;
    }
    markIntroSeen("p1");
    S.handY = -BODY * 1.6;           // starts above the stage
    run();
    const tl = gsap.timeline({ delay: 0.7 });
    if (/[?&]mmdebug/.test(location.search)) window.__miniMe = { tl, S, geo, hello, W3, body, A };
    // down the line, swinging a little, until her feet are just over the name
    // the line brings her down until her hips are just above the top of the letters
    const handStop = () => geo.seatY - BODY * 0.62;
    tl.add(measure, 0)
      .to(S, { handY: handStop, duration: 2.6, ease: "sine.out" }, 0)
      .add(() => rock(4, 2.8), 0)
      // let go and settle straight into the "Sitting" loop (legs moving), in one smooth blend
      .add(() => {
        measure(); S.ropeY = handStop();
        A.ledge.reset().setEffectiveWeight(1).play(); A.hang.crossFadeTo(A.ledge, 0.9, false);
      }, 2.3)
      .to(S, { sit: 1, hop: 1, duration: 0.9, ease: "sine.inOut" }, 2.3)
      // the line zips back up
      .to(S, { ropeY: ANCHOR_Y - 10, duration: 0.7, ease: "power3.in" }, 2.7)
      // hands onto the letters, then a wave hi, once
      .to(S, { brace: 1, duration: 0.6, ease: "sine.inOut" }, 3.0)
      .add(() => { settled = true; hello(); }, 3.6)
      .add(() => { showWave(); releaseHint(3500); }, 5.8);
  }

  function teardown() {
    running = false;
    window.removeEventListener("resize", fit);
    if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; }
  }

  /* ---------------- every return to Home: legs + a wave ---------------- */
  let leftHome = false;
  window.addEventListener("panelchange", (e) => {
    if (e.detail.index === 0) run();
    else { leftHome = true; if (e.detail.index > 1) running = false; }
  });
  window.addEventListener("panelsettle", (e) => {
    if (e.detail.index === 0 && leftHome && settled) { leftHome = false; run(); }
  });

  /* ---------------- hover her: a bubble nudging people to scroll ---------------- */
  const bubbleCss = document.createElement("style");
  bubbleCss.textContent = `
    .mm-nudge { position: absolute; z-index: 8; pointer-events: none; padding: 7px 13px; background: #fff;
      color: var(--ink, #262626); border-radius: 13px; font: 400 16px/1.3 "Source Serif 4", serif; white-space: nowrap;
      box-shadow: 0 14px 30px -14px rgba(20, 26, 50, .45); opacity: 0; transform: translateX(-8px) scale(.85);
      transform-origin: 0 50%; transition: opacity .25s ease, transform .35s cubic-bezier(.22, 1.4, .36, 1); }
    .mm-nudge::after { content: ""; position: absolute; left: -5px; top: 11px; width: 11px; height: 11px;
      background: #fff; transform: rotate(45deg); border-radius: 2px; }
    .mm-nudge.is-on { opacity: 1; transform: translateX(0) scale(1); }`;
  document.head.appendChild(bubbleCss);
  const bubble = document.createElement("div");
  bubble.className = "mm-nudge";
  bubble.setAttribute("aria-hidden", "true");
  bubble.textContent = "Scroll to explore my work 👀";
  stage.appendChild(bubble);
  let herBox = null, overHer = false;
  panel.addEventListener("mousemove", (e) => {
    if (!herBox || !settled) return;
    const sr = stage.getBoundingClientRect(), k = sr.width / stage.offsetWidth;
    const x = (e.clientX - sr.left) / k, y = (e.clientY - sr.top) / k;
    const over = x >= herBox.l && x <= herBox.r && y >= herBox.t && y <= herBox.b;
    if (over === overHer) return;
    overHer = over;
    bubble.classList.toggle("is-on", over);
  });
  panel.addEventListener("mouseleave", () => { overHer = false; bubble.classList.remove("is-on"); });

  /* ---------------- pointing at "Scroll to continue" ---------------- */
  let pointDir = null, pointTimer = null, hintUp = false;
  function aimAtHint() {
    if (!hint || !ready) return;
    const sr = stage.getBoundingClientRect(), hr = hint.getBoundingClientRect();
    const k = sr.width / stage.offsetWidth;
    const hx = (hr.left + hr.width * 0.3 - sr.left) / k, hy = (hr.top + hr.height * 0.5 - sr.top) / k;
    const sh = W3("RightArm");
    pointDir = T(hx, hy).sub(new THREE.Vector3(sh.x, sh.y, 0)).setZ(0).normalize();
  }
  function pointCycle() {
    if (!hintUp || !settled) return;
    aimAtHint();
    gsap.timeline()
      .to(S, { point: 1, duration: 0.6, ease: "sine.inOut" })
      .to(S, { point: 0, duration: 0.55, ease: "sine.inOut" }, "+=1.6");
    pointTimer = setTimeout(pointCycle, 6500);
  }
  window.addEventListener("scrollhint", (e) => {
    hintUp = !!(e.detail && e.detail.visible);
    clearTimeout(pointTimer);
    if (hintUp) pointTimer = setTimeout(pointCycle, 1500);
    else gsap.to(S, { point: 0, duration: 0.35, overwrite: "auto" });
  });
})();
