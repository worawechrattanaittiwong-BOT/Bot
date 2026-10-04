import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** A small, locally built articulated model. No remote model/texture requests. */
export function createRobotScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 0.85, 8.2);
  camera.lookAt(0, 0.35, 0);
  const environment = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentMap = generator.fromScene(environment, 0.04, 0.1, 20, { size: 64 });
  scene.environment = environmentMap.texture;
  environment.dispose();
  generator.dispose();
  scene.add(new THREE.HemisphereLight(0xe5f7ff, 0x3a255d, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8572ff, 2.2);
  rim.position.set(4, 2, -2);
  scene.add(rim);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const material = (options: THREE.MeshStandardMaterialParameters) => {
    const result = new THREE.MeshStandardMaterial(options);
    materials.add(result);
    return result;
  };
  const pearl = material({ color: 0xe8edf8, metalness: 0.22, roughness: 0.27 });
  const dark = material({ color: 0x101725, metalness: 0.65, roughness: 0.3 });
  const silver = material({ color: 0x8997b3, metalness: 0.75, roughness: 0.27 });
  const cyan = material({ color: 0x0788bb, emissive: 0x00b9ff, emissiveIntensity: 0.85, roughness: 0.4 });
  const violet = material({ color: 0x5535a9, emissive: 0x6730ff, emissiveIntensity: 0.9, roughness: 0.4 });
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material,
    x = 0, y = 0, z = 0) => {
    geometries.add(geometry);
    const part = new THREE.Mesh(geometry, surface);
    part.position.set(x, y, z);
    parent.add(part);
    return part;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, radius: number,
    surface: THREE.Material, x = 0, y = 0, z = 0) =>
    mesh(parent, new RoundedBoxGeometry(w, h, d, 3, radius), surface, x, y, z);
  // Extruded rounded panels keep a soft face silhouette even with a thin visor.
  const panel = (parent: THREE.Object3D, w: number, h: number, d: number, r: number,
    surface: THREE.Material, x: number, y: number, z: number) => {
    const shape = new THREE.Shape();
    const left = -w / 2, right = w / 2, bottom = -h / 2, top = h / 2;
    shape.moveTo(left + r, bottom);
    shape.lineTo(right - r, bottom);
    shape.quadraticCurveTo(right, bottom, right, bottom + r);
    shape.lineTo(right, top - r);
    shape.quadraticCurveTo(right, top, right - r, top);
    shape.lineTo(left + r, top);
    shape.quadraticCurveTo(left, top, left, top - r);
    shape.lineTo(left, bottom + r);
    shape.quadraticCurveTo(left, bottom, left + r, bottom);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - 0.04, bevelEnabled: true, bevelThickness: 0.02,
      bevelSize: 0.02, bevelSegments: 2, steps: 1, curveSegments: 8
    });
    geometry.translate(0, 0, -(d - 0.04) / 2);
    return mesh(parent, geometry, surface, x, y, z);
  };
  const sphereGeometry = new THREE.SphereGeometry(1, 20, 12);
  const sphere = (parent: THREE.Object3D, surface: THREE.Material, x: number, y: number, z: number,
    sx: number, sy = sx, sz = sx) => {
    const part = mesh(parent, sphereGeometry, surface, x, y, z);
    part.scale.set(sx, sy, sz);
    return part;
  };
  const ring = (parent: THREE.Object3D, radius: number, tube: number, surface: THREE.Material,
    x: number, y: number, z: number) =>
    mesh(parent, new THREE.TorusGeometry(radius, tube, 6, 32), surface, x, y, z);

  const robot = new THREE.Group();
  robot.rotation.y = -0.16;
  scene.add(robot);
  const head = new THREE.Group();
  head.position.y = 1.12;
  robot.add(head);
  box(head, 2.04, 1.65, 1.12, 0.49, pearl);
  panel(head, 1.79, 1.32, 0.3, 0.4, dark, 0, -0.035, 0.52);
  panel(head, 1.68, 1.2, 0.15, 0.36, silver, 0, -0.035, 0.665);
  panel(head, 1.63, 1.15, 0.16, 0.35, dark, 0, -0.035, 0.696);
  box(head, 0.85, 0.065, 0.67, 0.03, dark, 0, 0.814, -0.06);
  box(head, 0.59, 0.038, 0.04, 0.015, cyan, 0, 0.836, 0.25);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 1.01, 0.015, -0.03);
    ear.rotation.y = side * Math.PI / 2;
    head.add(ear);
    sphere(ear, dark, 0, 0, 0, 0.42, 0.52, 0.2);
    ring(ear, 0.335, 0.04, violet, 0, 0, 0.15).scale.y = 1.2;
    sphere(ear, pearl, 0, 0, 0.2, 0.3, 0.4, 0.12);
    ring(ear, 0.18, 0.025, cyan, 0, 0, 0.306).scale.y = 1.17;
    sphere(ear, dark, 0, 0, 0.305, 0.155, 0.18, 0.018);
  }

  // The LED face is one small texture, redrawn only while its expression changes.
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 256;
  faceCanvas.height = 192;
  const ctx = faceCanvas.getContext("2d")!;
  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  const faceMaterial = new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true, depthWrite: false, toneMapped: false });
  materials.add(faceMaterial);
  mesh(head, new THREE.PlaneGeometry(1.47, 1.03), faceMaterial, 0, -0.02, 0.785);
  let lastBlink = -1;
  let lastHappy = -1;
  function drawFace(blink: number, happy: number) {
    if (Math.abs(lastBlink - blink) < 0.02 && Math.abs(lastHappy - happy) < 0.03) return;
    lastBlink = blink;
    lastHappy = happy;
    ctx.clearRect(0, 0, 256, 192);
    ctx.strokeStyle = "#71efff";
    ctx.fillStyle = "#63edff";
    ctx.shadowColor = "#00bfff";
    ctx.shadowBlur = 12;
    ctx.lineCap = "round";
    ctx.lineWidth = 11;
    for (const x of [72, 184]) {
      ctx.save();
      ctx.translate(x, 81);
      ctx.scale(1, Math.max(0.06, 1 - blink));
      ctx.beginPath();
      ctx.moveTo(-25, 9);
      ctx.quadraticCurveTo(0, -32 - happy * 8, 25, 9);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(111, 118);
    ctx.quadraticCurveTo(128, 123, 145, 118);
    ctx.bezierCurveTo(146, 144 + happy * 3, 111, 144 + happy * 3, 111, 118);
    ctx.fill();
    ctx.globalAlpha = 0.28 + happy * 0.3;
    ctx.fillStyle = "#a58cff";
    ctx.shadowColor = "#805aff";
    for (const x of [48, 208]) {
      ctx.beginPath();
      ctx.ellipse(x, 111, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    faceTexture.needsUpdate = true;
  }

  sphere(robot, dark, 0, 0.23, 0, 0.28, 0.19, 0.28);
  ring(robot, 0.235, 0.024, cyan, 0, 0.23, 0).rotation.x = Math.PI / 2;
  sphere(robot, pearl, 0, -0.22, 0, 0.63, 0.64, 0.41);
  panel(robot, 0.71, 0.7, 0.13, 0.22, dark, 0, -0.14, 0.348);
  const badge = new THREE.Group();
  badge.position.set(0, -0.09, 0.432);
  robot.add(badge);
  // Two interlocking angular light strokes echo the brand mark.
  const logoStroke = (points: number[][], surface: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, "centripetal", 0);
    mesh(badge, new THREE.TubeGeometry(curve, 12, 0.037, 5, false), surface);
  };
  logoStroke([[0.1, 0.22], [-0.14, 0.09], [-0.14, -0.04], [0.02, -0.13]], cyan);
  logoStroke([[-0.07, -0.23], [0.15, -0.09], [0.15, 0.04], [-0.01, 0.13]], violet);
  for (const side of [-1, 1]) {
    const trim = box(robot, 0.04, 0.52, 0.045, 0.018, cyan, side * 0.42, -0.2, 0.328);
    trim.rotation.z = side * -0.28;
  }

  function arm(side: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.62, 0.01, 0);
    robot.add(shoulder);
    sphere(shoulder, dark, 0, 0, 0, 0.22);
    sphere(shoulder, pearl, side * 0.055, -0.06, 0.035, 0.235, 0.25, 0.25);
    ring(shoulder, 0.137, 0.027, violet, 0, 0, 0.243);
    box(shoulder, 0.29, 0.39, 0.31, 0.12, pearl, 0, -0.27, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.46;
    shoulder.add(elbow);
    sphere(elbow, dark, 0, 0, 0, 0.17);
    box(elbow, 0.33, 0.38, 0.34, 0.13, pearl, 0, -0.19, 0.025);
    const hand = new THREE.Group();
    hand.position.set(0, -0.47, 0.025);
    elbow.add(hand);
    box(hand, 0.25, 0.24, 0.17, 0.07, dark);
    ring(hand, 0.075, 0.016, cyan, 0, 0, 0.091);
    for (let i = 0; i < 3; i++) {
      const finger = box(hand, 0.067, 0.15, 0.09, 0.033, pearl, (i - 1) * 0.088, -0.17, 0.008);
      finger.rotation.z = (i - 1) * -0.12;
    }
    const thumb = box(hand, 0.09, 0.15, 0.1, 0.04, pearl, side * 0.175, -0.03, 0.02);
    thumb.rotation.z = side * 0.65;
    return { shoulder, elbow, hand };
  }
  const wavingArm = arm(-1);
  const restingArm = arm(1);
  restingArm.shoulder.rotation.z = 0.16;

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.31, -0.73, 0);
    leg.rotation.z = side * 0.055;
    robot.add(leg);
    sphere(leg, dark, 0, 0, 0, 0.21);
    box(leg, 0.34, 0.39, 0.35, 0.14, pearl, 0, -0.13, 0);
    sphere(leg, dark, 0, -0.34, 0.03, 0.2);
    ring(leg, 0.12, 0.023, violet, 0, -0.34, 0.193);
    box(leg, 0.35, 0.34, 0.36, 0.12, pearl, 0, -0.52, 0.01);
    box(leg, 0.48, 0.28, 0.65, 0.115, dark, 0, -0.74, 0.125);
    box(leg, 0.47, 0.28, 0.6, 0.12, pearl, 0, -0.685, 0.145);
    box(leg, 0.29, 0.035, 0.035, 0.016, cyan, 0, -0.746, 0.451);
  }

  let disposed = false;
  let enthusiasm = 0;
  let lastTime = 0;
  let nextBlink = 2.5;
  let blinkStarted = -10;
  function render(time: number, engaged: boolean, reducedMotion: boolean) {
    if (disposed) return;
    const delta = Math.min(Math.max(time - lastTime, 0), 0.08);
    lastTime = time;
    enthusiasm = reducedMotion ? 0 : THREE.MathUtils.damp(enthusiasm, engaged ? 1 : 0, 7, delta);
    const t = reducedMotion ? 0 : time;
    if (!reducedMotion && time >= nextBlink) {
      blinkStarted = time;
      nextBlink = time + 3 + Math.random() * 3;
    }
    const blinkAge = time - blinkStarted;
    const blink = !reducedMotion && blinkAge < 0.22 ? Math.sin(blinkAge / 0.22 * Math.PI) : 0;
    drawFace(blink, enthusiasm);
    robot.position.y = Math.sin(t * 1.7) * 0.028;
    robot.rotation.y = -0.16 + Math.sin(t * 0.65) * 0.035;
    head.rotation.z = Math.sin(t * 0.6) * 0.035 + enthusiasm * 0.07;
    head.rotation.y = Math.sin(t * 0.37) * 0.055;
    wavingArm.shoulder.rotation.z = -0.15 - enthusiasm * (1.55 + Math.sin(t * 7.5) * 0.16);
    wavingArm.shoulder.rotation.x = -enthusiasm * 0.2;
    wavingArm.shoulder.position.z = enthusiasm * 0.3;
    wavingArm.elbow.rotation.z = -enthusiasm * 0.8;
    wavingArm.hand.rotation.z = enthusiasm * Math.sin(t * 7.5) * 0.22;
    restingArm.shoulder.rotation.z = 0.16 + Math.sin(t * 1.7) * 0.025;
    cyan.emissiveIntensity = 0.8 + Math.sin(t * 1.5) * 0.18;
    renderer.render(scene, camera);
  }
  function resize(width: number, height: number) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(surface => surface.dispose());
    faceTexture.dispose();
    environmentMap.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return { render, resize, dispose };
}
