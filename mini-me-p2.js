/* Mini-me on Selected Work (desktop only).

   The first time the page comes into view she backs in from the far
   right dragging a beanbag right to its spot near the bottom-right
   corner (her laptop tucked under her other arm), lets go, turns and
   sinks back into it, opens the laptop on her lap and works away while
   vibing to the music in her earphones.
   - Cursor on her → she looks at the visitor, points at the projects and
     a speech bubble suggests the case studies.

   - Separate from mini-me.js on purpose (own canvas, own copy of the
     model), so Home and Work can never interfere with each other.
   - The canvas lives in #panel-2 itself, so it flips away with the page.
   - She's rendered UNLIT (see mini-me.js); the beanbag is lit, since
     it's a plain coloured shape that needs shading to read as soft.
   - The seated pose is the end of the "Stand To Sit" clip, held; leaning
     back, nodding, the hands on her lap, looking and pointing are all
     posed in code on top (a tiny one-bone IK). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { introSeen, markIntroSeen } from './mini-me-kit.js?v=12';

(function () {
  "use strict";
  const panel = document.getElementById("panel-2");
  const carousel = document.getElementById("carousel");
  if (!panel || !carousel || typeof gsap === "undefined") return;
  if (!window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)").matches) return;

  const W = 540, H = 350;        // canvas, css px (anchored bottom-right of the page)
  const BODY = 150;              // her standing height, css px
  const SIT_FROM_RIGHT = 175;    // where she sits, from the page's right edge (clear of the corner)
  const TUCK = 16;               // canvas bottom sits this far under the torn edge
  const SIDE = -Math.PI * 0.3;   // seated three-quarter view: facing left toward the projects, and a bit toward us
  const DPR = window.devicePixelRatio || 1;

  /* ---------------- canvas + scene ---------------- */
  let renderer;
  try {
    const c = document.createElement("canvas");
    c.className = "mini-me-canvas mini-me-p2";
    c.setAttribute("aria-hidden", "true");
    Object.assign(c.style, { position: "absolute", left: "0px", top: "0px", width: W + "px", height: H + "px",
      zIndex: "30", pointerEvents: "none", visibility: "hidden" });
    panel.appendChild(c);
    renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(3, DPR * 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, W, 0, -H, -2000, 2000);   // css px, y up
  cam.position.z = 1000;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9c, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-0.6, 1, 0.8);
  scene.add(sun);

  const body = new THREE.Group();      // facing/position of her
  scene.add(body);
  /* the beanbag is drawn in its own pass underneath her (depth cleared in
     between), so she always reads as sitting in it, never cut by it */
  const bagScene = new THREE.Scene();
  bagScene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9c, 2.2));
  const bagSun = new THREE.DirectionalLight(0xffffff, 1.4); bagSun.position.set(-0.6, 1, 0.8); bagScene.add(bagSun);
  renderer.autoClear = false;

  /* ---------------- where things go ---------------- */
  const geo = { left: 0, top: 0, floorY: 0, sitX: 0, enterX: 0 };

  /* the bottom strip is a tilted image: map a page point back into the
     image's own pixels to find where its torn edge really is */
  let stripData = null;
  function stripEdgeAt(x) {
    const img = panel.querySelector(".paper-strip--bottom");
    const wrap = img && img.closest(".paper-strip-wrap");
    if (!img || !wrap || !img.naturalWidth) return panel.offsetHeight - 60;
    if (!stripData) {
      try {
        const cw = Math.round(img.naturalWidth / 4), ch = Math.round(img.naturalHeight / 4);
        const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        const g = cv.getContext("2d"); g.drawImage(img, 0, 0, cw, ch);
        stripData = { cw, ch, a: g.getImageData(0, 0, cw, ch).data };
      } catch (e) { return panel.offsetHeight - 60; }
    }
    const tilt = (parseFloat(getComputedStyle(wrap).getPropertyValue("--tilt")) || 0) * Math.PI / 180;
    const ww = wrap.offsetWidth, wh = wrap.offsetHeight;
    const ox = wrap.offsetLeft + ww / 2, oy = wrap.offsetTop + wh / 2;   // transform origin (pre-transform)
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    for (let y = wrap.offsetTop - 80; y < panel.offsetHeight; y += 2) {
      // undo translateX(-50%) then the rotation, about the origin
      const dx = x - (ox - ww / 2), dy = y - oy;
      const lx = ox + cos * dx + sin * dy, ly = oy - sin * dx + cos * dy;
      const ix = (lx - wrap.offsetLeft - img.offsetLeft) / img.offsetWidth;
      const iy = (ly - wrap.offsetTop - img.offsetTop) / img.offsetHeight;
      if (ix < 0 || ix >= 1 || iy < 0 || iy >= 1) continue;
      const k = (Math.floor(iy * stripData.ch) * stripData.cw + Math.floor(ix * stripData.cw)) * 4 + 3;
      if (stripData.a[k] > 200) return y;
    }
    return panel.offsetHeight - 60;
  }

  /* the right end of the nav's menu lines (page px), so the beanbag can line up with it */
  function menuRight() {
    const d = document.querySelector("#navDots .dot");
    if (!d) return 0;
    const r = d.getBoundingClientRect();
    if (!r.width) return 0;
    // (relative to the viewport, which the page fills once it's in: mid page-flip the page itself is
    // rotated and its own rect would put her somewhere off the page)
    return r.right - (parseFloat(getComputedStyle(d).paddingRight) || 0);
  }
  let bagRightOff = 0;   // the turned beanbag's right edge, from its centre

  function place() {
    const pw = panel.offsetWidth;
    // the beanbag's right edge lines up with the end of the menu lines
    const mr = menuRight();
    const sitPageX = mr && bagRightOff ? mr - bagRightOff - bagHomeOffset().x : pw - SIT_FROM_RIGHT;
    const edge = stripEdgeAt(sitPageX);
    geo.left = pw - W;
    geo.top = edge + TUCK - H;
    renderer.domElement.style.left = geo.left + "px";
    renderer.domElement.style.top = geo.top + "px";
    // sit low, on the torn edge, but never closer than 12px to the page bottom
    const floorPage = Math.min(edge + 2, panel.offsetHeight - 12);
    geo.floorY = -(floorPage - geo.top);   // canvas coords (y up)
    geo.sitX = sitPageX - geo.left;
    geo.enterX = W + BODY * 0.4;       // just off the right edge, so she is in view straight away
    clearStars();
  }

  /* hide any of the page's sparkle stars that would crowd her corner
     (which one lands there depends on the window's shape) */
  function clearStars() {
    const pr = panel.getBoundingClientRect();
    if (Math.abs(pr.width - panel.offsetWidth) > 2) return;     // mid page-flip (rotated): positions are off, try again later
    // her canvas, or (once she's drawn) her actual figure, with a wide margin for the music notes
    const box = herRect ? { l: herRect.l, r: herRect.r, t: herRect.t, b: herRect.b }
                        : { l: geo.left, r: geo.left + W, t: geo.top, b: geo.top + H };
    const zone = { l: box.l - 220, r: box.r + 220, t: box.t - 220, b: box.b + 120 };
    panel.querySelectorAll(".p2-star").forEach((st) => {
      // the right-hand star shares her side of the page: always out of her way
      if (st.classList.contains("p2-star-c")) { st.style.visibility = "hidden"; return; }
      st.style.visibility = "";
      const b = st.getBoundingClientRect();
      const x = b.left + b.width / 2 - pr.left, y = b.top + b.height / 2 - pr.top;
      if (x > zone.l && x < zone.r && y > zone.t && y < zone.b) st.style.visibility = "hidden";
    });
  }

  /* ---------------- props ---------------- */
  /* the beanbag: a real model (assets/mini-me/beanbag.glb, decimated from
     the Tripo export). Its seat dip faces its +z; it's turned inside a
     wrapper so the dip faces the wrapper's −x, the way the rest of this file
     expects (front edge at −x, tall back at +x). Measured in model units: */
  const BAG_MODEL = { depth: 0.94, height: 0.80, dipY: 0.40, dipFwd: 0.10 };
  const bagReady = new Promise((res) => {
    new GLTFLoader().load("assets/mini-me/beanbag.glb?v=1", (g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 0; } });
      res(g.scene);
    }, undefined, () => res(null));
  });
  let bagDip = new THREE.Vector3();     // the seat dip's centre, wrapper-local
  let bagSeatY = 0;                     // the dip's height above the bag's base
  let bag, BAG_HW = 1, BAG_GRIP = new THREE.Vector3();

  /* her laptop: origin at the middle of the base's underside, width along x,
     the hinge at the far (+z) edge; the lid opens up off the keyboard */
  let LW = BODY * 0.34, LD = BODY * 0.23, LT = BODY * 0.016;   // sized to her chibi proportions (big head, small body)
  function makeLaptop() {
    const g = new THREE.Group();
    const shell = new THREE.MeshLambertMaterial({ color: 0xf0c9bb });   // rose gold, like her M1 MacBook
    const base = new THREE.Mesh(new THREE.BoxGeometry(LW, LT, LD), shell);
    base.position.y = LT / 2; g.add(base);
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(LW * 0.84, LD * 0.44), new THREE.MeshBasicMaterial({ color: 0x3a3e46 }));
    keys.rotation.x = -Math.PI / 2; keys.position.set(0, LT + 0.05, LD * 0.12); g.add(keys);
    const lid = new THREE.Group(); lid.position.set(0, LT, LD / 2); g.add(lid);
    const top = new THREE.Mesh(new THREE.BoxGeometry(LW, LT * 0.7, LD), shell);
    top.position.set(0, LT * 0.35, -LD / 2); lid.add(top);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(LW * 0.9, LD * 0.86), new THREE.MeshBasicMaterial({ color: 0xe6edf2 }));
    screen.rotation.x = Math.PI / 2; screen.position.set(0, -0.05, -LD / 2); lid.add(screen);
    // a soft logo in the middle of the lid back (the side we see), plus one little sticker
    const logo = new THREE.Mesh(new THREE.CircleGeometry(LD * 0.1, 24), new THREE.MeshBasicMaterial({ color: 0xfbe8e1 }));
    logo.rotation.x = -Math.PI / 2; logo.position.set(0, LT * 0.7 + 0.05, -LD * 0.5); lid.add(logo);
    const st = new THREE.Mesh(new THREE.CircleGeometry(LD * 0.08, 20), new THREE.MeshBasicMaterial({ color: 0x6e7b59 }));
    st.rotation.x = -Math.PI / 2; st.position.set(LW * 0.3, LT * 0.7 + 0.05, -LD * 0.25); lid.add(st);
    g.userData.lid = lid;
    return g;
  }
  const laptop = makeLaptop();

  /* the laptop has its own pass, so while it's tucked under her arm it can be
     drawn over her (bulky) jacket and hair, with just her arm drawn over it */
  const lapScene = new THREE.Scene();
  lapScene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9c, 2.2));
  const lapSun = new THREE.DirectionalLight(0xffffff, 1.4); lapSun.position.set(-0.6, 1, 0.8); lapScene.add(lapSun);
  lapScene.add(laptop);
  let tucked = false;

  /* a copy of her material that only draws her right arm (by skin weights),
     so the tucked laptop sits between her arm and her body */
  const skinned = [];
  function armOnly(mesh, map) {
    const mask = mesh.skeleton.bones.map((b) => (/Right(Arm|ForeArm|Hand)/.test(b.name) ? 1 : 0));
    const m = new THREE.MeshBasicMaterial({ map });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.armMask = { value: mask };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>\nuniform float armMask[${mask.length}];\nvarying float vArm;`)
        .replace("#include <skinning_vertex>", `#include <skinning_vertex>
          vArm = armMask[int(skinIndex.x)] * skinWeight.x + armMask[int(skinIndex.y)] * skinWeight.y
               + armMask[int(skinIndex.z)] * skinWeight.z + armMask[int(skinIndex.w)] * skinWeight.w;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vArm;")
        .replace("void main() {", "void main() {\n  if (vArm < 0.5) discard;");
    };
    m.customProgramCacheKey = () => "mm-arm-only";
    return m;
  }

  /* ---------------- model ---------------- */
  /* the "hang" clip's rope grip is a loose curl that still read as a second
     finger at this size: push each joint further along that same curl */
  function tightFist(f, tr) {
    if (!tr) return f.b.quaternion.clone();
    const grip = new THREE.Quaternion().fromArray(tr.values, 0);
    const d = grip.clone().multiply(f.rest.clone().invert());          // rest → grip
    const k = /Thumb/.test(f.b.name) ? 1.4 : 2.1;
    return new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), d, k).multiply(f.rest);
  }
  const indexF = [], curlF = [];   // pointing: index straight, the rest curled into a fist
  let mixer, model, bones = {}, A = {}, unit = 1, soleDrop = 0;
  const tex = new THREE.TextureLoader().load("assets/mini-me/mini-me-color.jpg?v=2");
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;           // see mini-me.js: mips darkened her
  tex.minFilter = THREE.LinearFilter;


  new GLTFLoader().load("assets/mini-me/mini-me.glb?v=11", (gltf) => {
    model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.material = new THREE.MeshBasicMaterial({ map: tex }); o.frustumCulled = false;
        if (o.isSkinnedMesh) skinned.push({ mesh: o, full: o.material, arm: armOnly(o, tex) });
      }
      if (o.isBone) {
        if (/LeftHandIndex[123]$/.test(o.name)) indexF.push({ b: o, rest: o.quaternion.clone() });
        if (/LeftHand(Middle|Ring|Pinky|Thumb)[123]$/.test(o.name)) curlF.push({ b: o, rest: o.quaternion.clone() });
        for (const k of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm",
                         "LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase",
                         "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]) {
          if (o.name.endsWith(k) && !o.name.endsWith("Up" + k)) bones[k] = o;
        }
      }
    });
    const clips = {};
    const grip = gltf.animations.find((c) => c.name === "hang");
    for (const f of curlF) {
      const tr = grip && grip.tracks.find((t) => t.name === f.b.name + ".quaternion");
      f.fist = tightFist(f, tr);
    }
    gltf.animations.forEach((c) => { clips[c.name] = c; });
    clips.sit = clips.sit2;                        // "Stand To Sit": a low, deep beanbag sit
    if (!clips.drag || !clips.sit) return;

    const holder = new THREE.Group();
    holder.add(model);
    model.updateMatrixWorld(true);
    const restBox = new THREE.Box3().setFromObject(model);
    unit = 1 / (() => { const s = restBox.getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z); })();   // her height, whichever way the rest pose lies
    mixer = new THREE.AnimationMixer(model);

    // face the camera, measured on an animated pose (see mini-me.js)
    const probe = mixer.clipAction(clips.sit); probe.play(); mixer.update(0);
    holder.updateMatrixWorld(true);
    const P = (k) => bones[k].getWorldPosition(new THREE.Vector3());
    const up = P("Head").sub(P("Hips")).normalize();
    const left = P("LeftArm").sub(P("RightArm"));
    left.sub(up.clone().multiplyScalar(left.dot(up))).normalize();
    const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
    holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd).invert());
    holder.scale.setScalar(unit);
    holder.updateMatrixWorld(true);
    holder.position.sub(P("Hips"));
    body.add(holder);
    body.scale.setScalar(BODY);
    body.updateMatrixWorld(true);
    probe.stop();

    // the soles sit a touch below the toe bones (the rest-pose bbox can't be used:
    // it's rotated differently from the animated pose)
    soleDrop = BODY * 0.035;

    // sit: find when she starts lowering, and how high her hips end up
    const sitA = mixer.clipAction(clips.sit); sitA.play();
    const hipsAboveFeet = (t) => {
      sitA.time = t; mixer.update(0); scene.updateMatrixWorld(true);
      return P("Hips").y - Math.min(P("LeftFoot").y, P("RightFoot").y);
    };
    const standH = hipsAboveFeet(0);
    let sitStart = 0;
    for (let t = 0; t < clips.sit.duration; t += clips.sit.duration / 60) {
      if (hipsAboveFeet(t) < standH * 0.96) { sitStart = Math.max(0, t - 0.2); break; }
    }
    const seatH = hipsAboveFeet(clips.sit.duration - 0.01) + soleDrop;
    sitA.stop();

    // clips: drag in place (the hips' sideways travel is cancelled per frame);
    // sit plays once from sitStart, then its last frame is held
    const sitHold = THREE.AnimationUtils.subclip(clips.sit, "sitHold",
      Math.floor(clips.sit.duration * 30) - 3, Math.floor(clips.sit.duration * 30) - 1, 30);

    A.drag = mixer.clipAction(clips.drag);
    A.sit = mixer.clipAction(clips.sit);
    A.sit.setLoop(THREE.LoopOnce, 1); A.sit.clampWhenFinished = true;
    A.hold = mixer.clipAction(sitHold);
    A.sitStart = sitStart;

    bagReady.then((bagModel) => {
      if (!bagModel) return;
      // about as tall as her shoulders when she stands; her deep sit sinks her into the dip
      const k = (BODY * 0.62) / BAG_MODEL.height;   // a bit below her shoulder height: she's the star, not the bag
      bag = new THREE.Group();
      bagModel.rotation.y = -Math.PI / 2;            // dip from +z round to −x
      bagModel.scale.setScalar(k);
      bag.add(bagModel);
      const bagH = BAG_MODEL.height * k;
      BAG_HW = (BAG_MODEL.depth * k) / 2;
      BAG_GRIP = new THREE.Vector3(-BAG_HW * 0.85, bagH * 0.45, 0);   // the low front lip, bag-local
      bagDip.set(-BAG_MODEL.dipFwd * k, 0, 0);
      bagSeatY = BAG_MODEL.dipY * k * 0.92;            // her hips rest just into the dip
      bagScene.add(bag);
      bag.rotation.set(0, SIDE + Math.PI / 2, 0); bag.updateMatrixWorld(true);
      bagRightOff = new THREE.Box3().setFromObject(bag, true).max.x;   // precise: its real silhouette
      ready = true;
      if (pendingStart) start();
    });
  });

  /* where the beanbag goes so its dip is right under her (she sits at geo.sitX),
     a touch behind her so she sinks back into it */
  function bagHomeOffset() {
    const yaw = SIDE + Math.PI / 2;
    const d = bagDip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const back = new THREE.Vector3(-Math.sin(SIDE), 0, -Math.cos(SIDE)).multiplyScalar(BAG_HW * 0.12);
    return { x: -d.x + back.x, z: -d.z + back.z };
  }

  /* ---------------- per-frame posing helpers ---------------- */
  const _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Quaternion();
  function aim(bone, child, dir, f) {
    if (f <= 0) return;
    const cur = child.getWorldPosition(_b).sub(bone.getWorldPosition(_a)).normalize();
    _q.setFromUnitVectors(cur, dir);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    _t.copy(_pq.invert().multiply(_q.multiply(_wq)));
    bone.quaternion.slerp(_t, f);
    bone.updateMatrixWorld(true);
  }
  const W3 = (k) => bones[k].getWorldPosition(new THREE.Vector3());
  const _bq = new THREE.Quaternion();
  /* rotate a bone about the world up axis (turning her head) */
  const _yq = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
  function yaw(bone, angle) {
    _yq.setFromAxisAngle(_Y, angle);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_yq.multiply(_wq)));
    bone.updateMatrixWorld(true);
  }
  function rotAbout(bone, axis, angle) {
    _yq.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_yq.multiply(_wq)));
    bone.updateMatrixWorld(true);
  }
  /* lean her upper body back into the beanbag (about her left–right axis) */
  function recline(f) {
    if (f <= 0) return;
    body.getWorldQuaternion(_bq);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_bq);
    rotAbout(bones.Spine, side, -0.3 * f);
    rotAbout(bones.Spine1, side, -0.12 * f);
    rotAbout(bones.Spine2, side, -0.04 * f);
  }
  /* vibing to the music: a nodding head, a little sway, hands resting on her
     lap with the near hand tapping the beat; pointing takes over the near arm */
  const BEAT = 1.55;   // nods per second (~93 bpm)
  function vibe(t, f) {
    if (f <= 0) return;
    body.getWorldQuaternion(_bq);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_bq);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_bq);
    const up = new THREE.Vector3(0, 1, 0);
    const beat = Math.sin(t * Math.PI * 2 * BEAT);
    const nod = Math.pow(0.5 + 0.5 * beat, 2) * 0.12 * (1 - S.look) * f;
    const down = LAP.down * S.place * (1 - S.look);                              // eyes on the screen
    rotAbout(bones.Neck, side, nod * 0.4 + down * 0.4);
    rotAbout(bones.Head, side, nod * 0.6 + down * 0.6);
    rotAbout(bones.Spine2, fwd, Math.sin(t * Math.PI * BEAT) * 0.035 * f);   // gentle side-to-side sway
  }

  /* the laptop: tucked under her right arm (near us) while she drags the
     beanbag, then on her lap, open, both hands typing in bursts */

  const _lapQ = new THREE.Quaternion(), _carQ = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const lapPos = new THREE.Vector3(), carPos = new THREE.Vector3();
  function laptopPose(t) {
    body.getWorldQuaternion(_bq);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_bq);    // her left
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_bq);
    const up = new THREE.Vector3(0, 1, 0);
    const carry = 1 - S.place;

    // carrying: the closed laptop tucked upright against her side, resting on
    // her forearm with the hand round its front corner, upper arm pressing it in
    if (carry > 0) {
      aim(bones.RightArm, bones.RightForeArm, up.clone().negate().addScaledVector(side, -0.15).addScaledVector(fwd, 0.05).normalize(), carry);
      aim(bones.RightForeArm, bones.RightHand, fwd.clone().addScaledVector(up, -0.35).addScaledVector(side, 0.12).normalize(), carry);
    }
    const elbow = W3("RightForeArm");
    const outward = side.clone().negate();
    carPos.copy(elbow).addScaledVector(up, -LD * 0.45).addScaledVector(fwd, LW * 0.28);   // waist height, poking out in front of her
    // while her right side faces us it's drawn in the tucked pass (over her
    // body, under her arm); once she's turned away it's depth-sorted as usual
    // (the switch happens with it edge-on to us, so there's no pop)
    tucked = carry > 0.5 && outward.z > 0;
    _m.makeBasis(fwd, side.clone(), new THREE.Vector3().crossVectors(fwd, side));
    _carQ.setFromRotationMatrix(_m);

    // on her lap, along her thighs (flattened a little), hinge toward the knees
    const hipC = W3("LeftUpLeg").add(W3("RightUpLeg")).multiplyScalar(0.5);
    const kneeC = W3("LeftLeg").add(W3("RightLeg")).multiplyScalar(0.5);
    const z = kneeC.clone().sub(hipC); const len = z.length(); z.y *= 0.5; z.normalize();
    const x = side.clone().addScaledVector(z, -side.dot(z)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    lapPos.copy(hipC).addScaledVector(z, len * LAP.along).addScaledVector(y, BODY * LAP.lift);
    _m.makeBasis(x, y, z);
    _lapQ.setFromRotationMatrix(_m);

    // typing: hands to the keys, tapping in little bursts
    const w = S.place;
    if (w > 0) {
      const burst = (0.55 + 0.45 * THREE.MathUtils.smoothstep(Math.sin(t * 0.8) + Math.sin(t * 1.9) * 0.5, -0.2, 0.4)) * S.type;
      const kb = lapPos.clone().addScaledVector(y, LT).addScaledVector(z, -LD * 0.05);
      const upper = fwd.clone().multiplyScalar(0.3).sub(up).normalize();
      const keyTo = (arm, fore, hnd, sgn, ph, wt) => {
        if (wt <= 0) return;
        aim(arm, fore, upper.clone().addScaledVector(side, sgn * 0.12).normalize(), wt);
        const tgt = kb.clone().addScaledVector(x, sgn * LW * 0.2)
          .addScaledVector(y, BODY * 0.025 * burst * Math.max(0, Math.sin(t * 17 + ph)));
        aim(fore, hnd, tgt.sub(W3(fore.name.endsWith("LeftForeArm") ? "LeftForeArm" : "RightForeArm")).normalize(), wt);
      };
      keyTo(bones.RightArm, bones.RightForeArm, bones.RightHand, -1, 0, w);
      keyTo(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, 1, 2.2, w * (1 - S.point));
    }

    // where the laptop is: from her arm to her lap, with a little lift on the way
    laptop.position.lerpVectors(carPos, lapPos, w).addScaledVector(up, BODY * 0.12 * Math.sin(w * Math.PI));
    laptop.quaternion.slerpQuaternions(_carQ, _lapQ, w);
    laptop.userData.lid.rotation.x = S.lid * 1.8;
  }
  const LAP = { along: 0.7, lift: 0.09, down: 0.6 };
  function lookAtViewer(f) {
    if (f <= 0) return;
    body.getWorldQuaternion(_bq);
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(_bq).normalize();
    aim(bones.Neck, bones.Head, dir, f);          // lift her head to us
    aim(bones.Head, bones.HeadTop_End, dir, f);
    const turn = -S.turn * 0.75 * f;              // from facing left, round toward the camera
    yaw(bones.Neck, turn * 0.4);
    yaw(bones.Head, turn * 0.6);
  }

  /* ---------------- state ---------------- */
  let ready = false, pendingStart = false, started = false, active = false, running = false;
  const S = { recline: 0, chill: 0, mode: "idle", x: 0, bagX: 0, bagZ: 0, bagTilt: 0, bagYaw: 0, bagY: 0, dragOff: 0,
              look: 0, point: 0, turn: Math.PI / 2, place: 0, lid: 0, type: 0, perch: 0 };
  const clock = new THREE.Clock();
  let pointDir = new THREE.Vector3(-1, 0.4, 0).normalize();
  let herRect = null;
  const _hitBox = new THREE.Box3();

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    mixer.update(dt);
    body.rotation.set(0, S.turn, 0);
    scene.updateMatrixWorld(true);

    if (S.mode === "chill" || S.mode === "sitting") {
      recline(S.recline);
      vibe(clock.elapsedTime, S.chill);
      lookAtViewer(S.look);
    }
    laptopPose(clock.elapsedTime);
    if (S.mode === "chill" || S.mode === "sitting") {
      if (S.point > 0) {
        aim(bones.LeftArm, bones.LeftForeArm, pointDir, S.point);
        aim(bones.LeftForeArm, bones.LeftHand, pointDir, S.point);
        for (const f of indexF) { f.b.quaternion.slerp(f.rest, S.point); f.b.updateMatrixWorld(true); }   // finger out, not a fist
    for (const f of curlF) { f.b.quaternion.slerp(f.fist, S.point); f.b.updateMatrixWorld(true); }
      }
    }

    // pin: soles on the floor, hips at S.x
    scene.updateMatrixWorld(true);
    const feet = Math.min(W3("LeftToeBase").y, W3("RightToeBase").y) - soleDrop;
    const hips = W3("Hips");
    // standing: soles on the floor; sitting: hips up in the beanbag's dip (not on the floor in front of it)
    const dyFloor = geo.floorY - feet, dySeat = (S.bagY + bagSeatY) - hips.y;
    const dy = dyFloor + (dySeat - dyFloor) * S.perch, dx = S.x - hips.x;
    body.position.y += dy; body.position.x += dx;
    laptop.position.x += dx; laptop.position.y += dy;
    scene.updateMatrixWorld(true);

    // beanbag: dragged by her hands while arriving, then under her
    if (S.mode === "drag") {
      // her hands grip the beanbag's near top edge, which lifts a little
      const hands = W3("LeftHand");                                   // the other arm has her laptop
      const tilt = -0.32 + Math.sin(clock.elapsedTime * 9) * 0.03;
      const g = BAG_GRIP.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      S.bagX = hands.x - g.x;
      S.dragOff = S.bagX - S.x;                                         // where the bag trails her
      const lowest = Math.min(0, BAG_HW * Math.sin(tilt));            // far bottom corner after the tilt
      S.bagTilt = tilt;
      S.bagY = Math.max(hands.y - g.y, geo.floorY - 2 - lowest);
    }
    bag.rotation.set(0, S.bagYaw, S.bagTilt);
    bag.position.set(S.bagX, S.bagY, S.bagZ);

    // the whole little scene — her and the beanbag — for hit-testing the cursor (page coords)
    const pts = ["HeadTop_End", "Hips", "LeftToeBase", "RightToeBase", "LeftHand", "RightHand"].map(W3);
    bag.updateMatrixWorld(true);
    _hitBox.setFromObject(bag);
    pts.push(_hitBox.min, _hitBox.max);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    herRect = { l: geo.left + Math.min(...xs) - 6, r: geo.left + Math.max(...xs) + 6,
                t: geo.top - Math.max(...ys) - 8, b: geo.top - Math.min(...ys) + 4 };
    if (S.point > 0) {
      // to her left, level with her face, clear of her pointing hand
      const top = W3("HeadTop_End"), head = W3("Head"), hand = W3("LeftHand");
      const leftmost = Math.min(top.x, head.x, hand.x) - 18;
      bubble.style.left = (geo.left + leftmost) + "px";
      bubble.style.top = (geo.top - (top.y + head.y) / 2) + "px";
    }

    if (active) {
      renderer.clear();
      renderer.render(bagScene, cam);
      renderer.clearDepth();
      renderer.render(scene, cam);
      if (tucked) {
        renderer.clearDepth();
        renderer.render(lapScene, cam);          // over her body…
        renderer.clearDepth();
        for (const k of skinned) k.mesh.material = k.arm;
        renderer.render(scene, cam);             // …and her arm over it
        for (const k of skinned) k.mesh.material = k.full;
      } else {
        renderer.render(lapScene, cam);          // depth-tested against her (on her lap)
      }
      if (firstFrame) { firstFrame = false; requestAnimationFrame(() => { renderer.domElement.style.opacity = "1"; }); }
    }
    requestAnimationFrame(frame);
  }

  let firstFrame = false;
  function run() { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } }

  function start() {
    if (started) return;
    if (!ready) { pendingStart = true; return; }
    started = true;
    place();
    window.addEventListener("resize", place);
    // shown only once her first frame is drawn (an undrawn WebGL canvas can
    // flash as a grey box mid page-flip)
    renderer.domElement.style.opacity = "0";
    renderer.domElement.style.visibility = "visible";
    firstFrame = true;

    S.mode = "drag"; S.x = geo.enterX; S.turn = Math.PI / 2;    // facing right, walking backwards
    A.drag.play();
    // measure, right now, how far behind her hands the beanbag trails, so the
    // drag ends with the bag exactly on its spot (no sliding afterwards)
    mixer.update(0);
    body.rotation.set(0, S.turn, 0);
    body.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    {
      const hands = W3("LeftHand");
      const g = BAG_GRIP.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.32);
      S.dragOff = (hands.x - g.x) - W3("Hips").x;
    }
    run();
    if (introSeen("p2")) { settleNow(); return; }    // back from a case study: already on her beanbag
    markIntroSeen("p2");
    const bagHome = () => geo.sitX + bagHomeOffset().x;
    // straight away when flipped to; on a visit that opens on this page (a
    // refresh on #work), a beat after load so the page has settled first
    const tl = gsap.timeline({ delay: 1.5 });      // 1.5s after the page comes up
    // back in from the right, dragging the beanbag right to its spot
    // measure again as she sets off: on arriving from another page the flip may still have been settling
    tl.add(place, 0)
      .to(S, { x: () => bagHome() - S.dragOff, duration: 3.6, ease: "sine.out" }, 0)
      // let go: the beanbag settles flat where it is
      .add(() => { S.mode = "letgo"; })
      .to(S, { bagTilt: 0, bagY: () => geo.floorY - 2, duration: 0.6, ease: "sine.out" }, "<")
      // a couple of steps back toward it while turning round to sit side-on —
      // still stepping (the walk keeps playing, slower), so nothing slides
      .add(() => { A.drag.setEffectiveTimeScale(-0.7); }, "<0.15")   // reversed: small steps forward, to the bag
      .to(S, { x: () => geo.sitX, duration: 1.1, ease: "sine.inOut" }, "<")
      .to(S, { turn: SIDE, duration: 1.1, ease: "sine.inOut" }, "<")
      .to(S, { bagYaw: SIDE + Math.PI / 2, bagZ: () => bagHomeOffset().z, duration: 1.1, ease: "sine.inOut" }, "<")   // beanbag turns to match her
      // then straight down into it in one smooth blend, settling back as she goes
      .add(() => {
        S.mode = "sitting";
        A.sit.reset(); A.sit.time = A.sitStart; A.sit.setEffectiveTimeScale(0.8).setEffectiveWeight(1).play();
        A.drag.crossFadeTo(A.sit, 0.45, false);
        gsap.to(S, { perch: 1, duration: 1.1, ease: "sine.inOut" });   // settling up into the dip as she sits
      }, "-=0.2")
      .to(S, { recline: 1, duration: 1.8, ease: "sine.inOut" }, "+=" + ((A.sit.getClip().duration - A.sitStart) / 0.8 * 0.45))
      // the laptop comes up onto her lap as she settles
      .to(S, { place: 1, duration: 1.4, ease: "sine.inOut" }, "<-0.3")
      .add(() => enterChill(1.0), "<0.9")
      // open it and get to work
      .to(S, { lid: 1, duration: 0.8, ease: "back.out(1.3)" }, "+=0.3")
      .to(S, { type: 1, duration: 0.6, ease: "sine.out" });
    arrival = tl;
  }

  /* straight to the end of the arrival: on the beanbag, laptop open */
  function settleNow() {
    if (arrival) arrival.kill();
    A.drag.stop();
    Object.assign(S, { x: geo.sitX, turn: SIDE, bagX: geo.sitX + bagHomeOffset().x, bagZ: bagHomeOffset().z, bagYaw: SIDE + Math.PI / 2,
      bagTilt: 0, bagY: geo.floorY - 2, mode: "sitting", place: 1, lid: 1, type: 1, perch: 1 });
    A.sit.reset(); A.sit.time = A.sit.getClip().duration; A.sit.setEffectiveTimeScale(1).play();
    mixer.update(0);
    enterChill(0);
  }

  function enterChill(fade) {
    if (S.mode === "chill") return;
    S.mode = "chill";
    clearStars();
    A.hold.reset().setEffectiveWeight(1).play();
    if (fade > 0) { A.hold.fadeIn(fade); A.sit.fadeOut(fade); gsap.to(S, { chill: 1, duration: fade * 1.4, ease: "sine.inOut" }); }
    else { A.sit.stop(); S.recline = 1; S.chill = 1; }
    updateAttention();
  }
  let arrival;

  /* ---------------- speech bubble (shown while she points) ---------------- */
  const css = document.createElement("style");
  css.textContent = `
    .mm-bubble { position: absolute; z-index: 31; pointer-events: none; width: 200px; box-sizing: border-box;
      padding: 10px 14px; background: #fff; color: var(--ink, #262626); border-radius: 14px;
      font: 400 15px/1.35 "Source Serif 4", serif; box-shadow: 0 14px 30px -14px rgba(20, 26, 50, .45);
      opacity: 0; transform: translate(-100%, -50%) scale(.85); transform-origin: 100% 50%;
      transition: opacity .25s ease, transform .35s cubic-bezier(.22, 1.4, .36, 1); }
    .mm-bubble::after { content: ""; position: absolute; right: -6px; top: calc(50% - 7px); width: 14px; height: 14px;
      background: #fff; transform: rotate(45deg); border-radius: 2px; }
    .mm-bubble.is-on { opacity: 1; transform: translate(-100%, -50%) scale(1); }`;
  document.head.appendChild(css);
  const bubble = document.createElement("div");
  bubble.className = "mm-bubble";
  bubble.setAttribute("aria-hidden", "true");
  bubble.textContent = "Give the case studies a try, they're really interesting! ✨";
  panel.appendChild(bubble);

  /* ---------------- music notes (while she's vibing) ---------------- */
  const noteCss = document.createElement("style");
  noteCss.textContent = `.mm-note { position: absolute; z-index: 31; pointer-events: none; color: var(--sage, #6e7b59);
    font: 600 16px/1 "Source Serif 4", serif; will-change: transform, opacity; }`;
  document.head.appendChild(noteCss);
  let noteSide = 1;
  function spawnNote() {
    if (!active || S.mode !== "chill" || S.point > 0.1 || document.hidden) return;
    const head = W3("HeadTop_End");
    const n = document.createElement("span");
    n.className = "mm-note";
    n.setAttribute("aria-hidden", "true");
    n.textContent = Math.random() < 0.5 ? "♪" : "♫";
    noteSide = -noteSide;
    const x0 = geo.left + head.x + noteSide * (6 + Math.random() * 8), y0 = geo.top - head.y - 4;
    n.style.left = x0 + "px"; n.style.top = y0 + "px";
    n.style.fontSize = (13 + Math.random() * 6) + "px";
    panel.appendChild(n);
    gsap.fromTo(n, { opacity: 0, y: 0, x: 0, rotation: noteSide * -10, scale: 0.6 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "sine.out" });
    gsap.to(n, { y: -42 - Math.random() * 14, x: noteSide * (10 + Math.random() * 10), rotation: noteSide * 14,
      duration: 2.2, ease: "sine.out" });
    gsap.to(n, { opacity: 0, duration: 0.7, delay: 1.5, ease: "sine.in", onComplete: () => n.remove() });
  }
  setInterval(spawnNote, 900);

  /* ---------------- attention: cursor on her ---------------- */
  let overHer = false;
  function updateAttention() {
    if (S.mode !== "chill") return;
    const look = overHer ? 1 : 0;
    const point = overHer ? 1 : 0;
    if (point && !S.point) {
      // aim at the middle of the carousel
      const pr = panel.getBoundingClientRect(), cr = carousel.getBoundingClientRect();
      const sh = W3("LeftArm");
      const tx = cr.left + cr.width / 2 - pr.left - geo.left, ty = -(cr.top + cr.height * 0.45 - pr.top - geo.top);
      pointDir = new THREE.Vector3(tx - sh.x, ty - sh.y, 0).normalize();
    }
    gsap.to(S, { look, duration: look ? 0.35 : 0.6, ease: "power2.out", overwrite: "auto" });
    gsap.to(S, { point, duration: point ? 0.5 : 0.55, ease: "sine.inOut", overwrite: "auto" });
    bubble.classList.toggle("is-on", !!point);
  }
  panel.addEventListener("mousemove", (e) => {
    if (!herRect) return;
    const pr = panel.getBoundingClientRect();
    const x = e.clientX - pr.left, y = e.clientY - pr.top;
    const over = x >= herRect.l && x <= herRect.r && y >= herRect.t && y <= herRect.b;
    if (over !== overHer) { overHer = over; updateAttention(); }
  });
  panel.addEventListener("mouseleave", () => { if (overHer) { overHer = false; updateAttention(); } });

  /* ---------------- page visibility ---------------- */
  // once the page has finished flipping in, its stars are where they'll stay
  window.addEventListener("panelsettle", (e) => { if (e.detail.index === 1 && started) clearStars(); });
  window.addEventListener("panelchange", (e) => {
    active = e.detail.index === 1 || e.detail.index === 0 || e.detail.index === 2;   // keep drawing while a neighbouring page flips over it
    if (e.detail.index === 1 && window.__flipLoaded) start();
  });
  // already on this page by the time this script runs (e.g. a refresh on #work); until the page
  // has loaded the scroll position is still being restored, so go by the URL
  if (window.__flipLoaded ? window.__panelIndex === 1 : /^#work$/i.test(location.hash)) { active = true; start(); }
  if (/[?&]mmdebug/.test(location.search)) window.__miniMeP2 = { S, A: () => A, start, geo, rect: () => herRect,
    skipToPhone: settleNow,
    setHover: (h) => { overHer = h; updateAttention(); }, LAP, laptop, W3, tl: () => arrival, skinned, tucked: () => tucked };
})();
