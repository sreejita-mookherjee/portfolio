/* Shared bits for the newer mini-me scenes (page 4, page 5, the phone hero
   and the case-study walker): a canvas inside a stage (stage px, the
   1726×996 frame, y up), her model loaded and turned to face the camera,
   and bone helpers. (Pages 1 and 2 predate this and carry their own, but
   use introSeen below.) */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export { THREE };

/* Coming back from a case study, the browser doesn't always restore the
   home page as it was: some always reload it, others do when memory is
   tight. Then the intros already watched this visit skip to how they end
   instead of playing again. (A plain refresh still replays them.) */
const RETURNING = (() => {
  try {
    // (a refresh keeps the original referrer, so only a real arrival counts)
    const type = (performance.getEntriesByType("navigation")[0] || {}).type;
    if (type === "back_forward") return true;
    return type === "navigate" && /\/work\/[^/]+$/.test(new URL(document.referrer).pathname);
  } catch (e) { return false; }
})();
export const introSeen = (key) => { try { return RETURNING && sessionStorage.getItem("mm-seen-" + key) === "1"; } catch (e) { return false; } };
export const markIntroSeen = (key) => { try { sessionStorage.setItem("mm-seen-" + key, "1"); } catch (e) { /* private mode: fine */ } };
export const CW = 1726, CH = 996;
const stageScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stage-scale")) || 1;

/* a full-stage canvas + scene; T(x, y) maps stage px to scene coords */
export function makeStageScene(stage, zIndex = 7) {
  const c = document.createElement("canvas");
  c.className = "mini-me-canvas";
  c.setAttribute("aria-hidden", "true");
  Object.assign(c.style, { position: "absolute", left: "0px", top: "0px", width: CW + "px", height: CH + "px",
    zIndex: String(zIndex), pointerEvents: "none", opacity: "0" });
  stage.appendChild(c);
  const renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const DPR = window.devicePixelRatio || 1;
  const fit = () => { renderer.setPixelRatio(Math.min(2.5, DPR * stageScale() * 1.4)); renderer.setSize(CW, CH, false); };
  fit();
  window.addEventListener("resize", fit);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9c, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-0.5, 1, 0.9); scene.add(sun);
  const cam = new THREE.OrthographicCamera(0, CW, 0, -CH, -2000, 2000);
  cam.position.z = 1000;
  const T = (x, y, z = 0) => new THREE.Vector3(x, -y, z);
  let shown = false;
  const render = () => {
    renderer.render(scene, cam);
    if (!shown) { shown = true; requestAnimationFrame(() => { c.style.opacity = "1"; }); }
  };
  return { canvas: c, renderer, scene, cam, T, render };
}

// her files, relative to this script (so pages in sub-folders, like the case studies, find them too)
const ASSET = (p) => new URL(p, import.meta.url).href;

/* her model, unlit, facing the camera (hips at the body group's origin) */
export function loadMiniMe(BODY, cb) {
  const tex = new THREE.TextureLoader().load(ASSET("assets/mini-me/mini-me-color.jpg?v=2"));
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;     // see mini-me.js: mips darkened her
  new GLTFLoader().load(ASSET("assets/mini-me/mini-me.glb?v=11"), (gltf) => {
    const model = gltf.scene, bones = {};
    model.traverse((o) => {
      if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ map: tex }); o.frustumCulled = false; }
      if (o.isBone) {
        for (const k of ["Hips", "Spine2", "Neck", "Head", "HeadTop_End", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm",
                         "LeftHand", "RightHand", "LeftToeBase", "RightToeBase"]) {
          if (o.name.endsWith(k) && !o.name.endsWith("Up" + k)) bones[k] = o;
        }
      }
    });
    const clips = {};
    gltf.animations.forEach((c) => { clips[c.name] = c; });
    const holder = new THREE.Group(), body = new THREE.Group();
    holder.add(model);
    model.updateMatrixWorld(true);
    const s = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const unit = 1 / Math.max(s.x, s.y, s.z);
    const mixer = new THREE.AnimationMixer(model);
    const probe = mixer.clipAction(clips.idle || clips.wave); probe.play(); mixer.update(0);
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
    probe.stop();
    cb({ body, bones, mixer, clips, soleDrop: BODY * 0.035 });
  }, undefined, () => cb(null));
}

/* posing helpers bound to one character */
export const FACE_PITCH = -0.32, FACE_YAW = -0.32;   // her painted eyes glance up and to her left: aim the face off by that much
export function poser(bones, body) {
  const _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const W3 = (k) => bones[k].getWorldPosition(new THREE.Vector3());
  function aim(bone, child, dir, f = 1) {
    if (f <= 0) return;
    const cur = child.getWorldPosition(_b).sub(bone.getWorldPosition(_a)).normalize();
    _q.setFromUnitVectors(cur, dir);
    bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.slerp(_pq.invert().multiply(_q.multiply(_wq)), f);
    bone.updateMatrixWorld(true);
  }
  function rotAbout(bone, axis, angle) {
    _rq.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_rq.multiply(_wq)));
    bone.updateMatrixWorld(true);
  }
  /* turn her head (and a little of her neck) so her face points straight out at the viewer,
     whatever the clip has it doing; f 0→1. Mixamo head bones face along their local +x */
  const _fx = new THREE.Vector3(), _hq = new THREE.Quaternion(), _out = new THREE.Vector3(FACE_YAW, FACE_PITCH, 1).normalize(), _id = new THREE.Quaternion();
  // (the bone's +x runs a little above her actual line of sight, so aim it a touch low)
  function faceUser(f = 1) {
    if (f <= 0) return;
    for (const [b, w] of [[bones.Neck, 0.35], [bones.Head, 1]]) {
      b.getWorldQuaternion(_hq);
      _fx.set(1, 0, 0).applyQuaternion(_hq);
      _q.setFromUnitVectors(_fx, _out);
      _q.slerp(_id, 1 - f * w);                      // (slerp toward identity = only part of the turn)
      _wq.copy(_hq); b.parent.getWorldQuaternion(_pq);
      b.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq)));
      b.updateMatrixWorld(true);
    }
  }
  return { W3, aim, rotAbout, faceUser };
}

/* the root motion a clip carries (scene units, body rotation 0), and its duration */
export function rootTravel(mixer, clip, body, bones) {
  const a = mixer.clipAction(clip); a.reset().play();
  const at = (t) => { a.time = t; mixer.update(0); body.updateMatrixWorld(true); return bones.Hips.getWorldPosition(new THREE.Vector3()); };
  const p0 = at(0), p1 = at(clip.duration - 0.001);
  a.stop();
  return p1.sub(p0);
}

/* the page this script is on is showing (now, or later) → cb, once */
export function whenPage(index, cb) {
  let done = false;
  const go = () => { if (!done) { done = true; cb(); } };
  // until the page has loaded, the scroll position is still being restored: go by the URL
  const slug = ["home", "work", "about", "journey", "contact"][index];
  if (window.__flipLoaded ? window.__panelIndex === index : location.hash.toLowerCase() === "#" + slug) go();
  window.addEventListener("panelchange", (e) => { if (e.detail.index === index && window.__flipLoaded) go(); });
}
