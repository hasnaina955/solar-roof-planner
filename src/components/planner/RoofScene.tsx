/**
 * The 3D planner scene.
 *
 * Everything the homeowner sees lives here: the roof surface they trace, the
 * modules laid out on it, the obstructions that shade them, and the sun's real
 * path for the selected day with live shadows.
 *
 * Coordinate note: `roofGroup` carries the roof-plane basis matrix, so every
 * child is positioned in roof local coordinates (+X along the eaves,
 * +Y up the slope, +Z along the roof normal). That basis is left-handed, which
 * is fine for *transforms* but never for extracting a rotation — so nothing in
 * here calls setFromRotationMatrix on it. Modules only ever rotate about their
 * own eaves axis in roof local space.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Vec3 } from "@/lib/solar";
import type { Obstacle, Panel, Point2, RoofFrame } from "@/lib/roof";
import { roofFrame } from "@/lib/roof";
import {
  makePanelTexture,
  makeShingleTexture,
  makeWallTexture,
} from "./materials";

export type SceneMode = "orbit" | "draw" | "obstacle";

/** Camera framings the homeowner can jump between. */
export type SceneView = "perspective" | "top" | "sun";

interface RoofSceneProps {
  polygon: Point2[];
  /** Installed modules only. Geometry is stable while the sun is scrubbed. */
  panels: Panel[];
  shades: number[];
  obstacles: Obstacle[];
  tilt: number;
  azimuth: number;
  /** Tilt of the modules above the roof plane, degrees. Zero = flush. */
  rackTilt: number;
  sunDirection: Vec3;
  sunArc: Vec3[];
  arcLabels: { direction: Vec3; text: string }[];
  mode: SceneMode;
  drawPoints: Point2[];
  ghostPolygon: Point2[];
  hoveredPanel: string | null;
  onAddDrawPoint: (point: Point2) => void;
  onHoverPanel: (id: string | null) => void;
  onPickObstacle: (point: Point2) => void;
  showSun: boolean;
  showHeatmap: boolean;
  /** Camera framing preset. Changing it tweens the camera into place. */
  view?: SceneView;
}

const EAVE_HEIGHT = 2.9;
const EAVES_OVERHANG = 0.42;
const ROOF_THICKNESS = 0.16;
const SUN_RADIUS = 34;

interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  roofGroup: THREE.Group;
  pickPlane: THREE.Mesh;
  sunLight: THREE.DirectionalLight;
  sunGroup: THREE.Group;
  hemi: THREE.HemisphereLight;
  mode: SceneMode;
  panelPicks: THREE.Object3D[];
  panelTexture: THREE.CanvasTexture;
  shingleTexture: THREE.CanvasTexture;
  wallTexture: THREE.CanvasTexture;
  /** Set by the view-preset effect; the render loop tweens the camera to it. */
  cameraGoal: { position: THREE.Vector3; target: THREE.Vector3 } | null;
  /** Module rise-in animation, restarted whenever the layout changes. */
  build: { start: number; cells: THREE.Matrix4[]; frames: THREE.Matrix4[] } | null;
  framesMesh: THREE.InstancedMesh | null;
}

/* ------------------------------------------------------------------ *
 * Canvas textures
 * ------------------------------------------------------------------ */

function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#8fa27f";
  ctx.fillRect(0, 0, 1024, 1024);
  // Soft mottling so the lawn does not read as flat plastic.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 6 + Math.random() * 46;
    ctx.fillStyle = `rgba(${90 + Math.random() * 60}, ${120 + Math.random() * 55}, ${78 + Math.random() * 40}, 0.06)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

function makeSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 512, 0, 0);
  gradient.addColorStop(0, "#c9d4dc");
  gradient.addColorStop(0.42, "#d8e4ee");
  gradient.addColorStop(0.62, "#b9cfe6");
  gradient.addColorStop(1, "#7ba7d4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLabelSprite(text: string, color = "#6f7a89"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = color;
  ctx.font = "600 66px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.scale.set(3.2, 1.6, 1);
  return sprite;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,220,150,0.95)");
  gradient.addColorStop(0.32, "rgba(255,193,86,0.34)");
  gradient.addColorStop(1, "rgba(255,193,86,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) {
      const spriteMaterial = material as THREE.SpriteMaterial;
      // Textures flagged shared are reused across rebuilds, so they outlive the
      // mesh that happens to be referencing them right now.
      if (!spriteMaterial.map?.userData?.shared) spriteMaterial.map?.dispose();
      material.dispose();
    }
  });
}

/** Lit fraction -> colour ramp: deep indigo (shaded) through amber (full sun). */
function heatColour(lit: number): THREE.Color {
  const t = THREE.MathUtils.clamp(lit, 0, 1);
  return new THREE.Color().setHSL(0.66 - 0.56 * t, 0.32 + 0.5 * t, 0.28 + 0.4 * t);
}

/**
 * World-space bounds of the roof, house and the ground under it.
 *
 * Used to frame the camera, so the framing adapts when the homeowner traces a
 * different roof or changes the pitch instead of being hard-coded.
 */
function roofWorldBounds(polygon: Point2[], frame: RoofFrame, tiltRad: number) {
  const box = new THREE.Box3();
  if (polygon.length < 3) {
    box.setFromPoints([
      new THREE.Vector3(-5, 0, -4),
      new THREE.Vector3(5, 6, 4),
    ]);
  } else {
    const e = frame.eaves;
    const u = frame.upSlope;
    const cosTilt = Math.cos(tiltRad) || 1;
    let cx = 0;
    let cy = 0;
    for (const p of polygon) {
      cx += p.x;
      cy += p.y;
    }
    cx /= polygon.length;
    cy /= polygon.length;
    const offsetX = e.x * cx + (u.x / cosTilt) * cy;
    const offsetZ = e.z * cx + (u.z / cosTilt) * cy;

    for (const p of polygon) {
      box.expandByPoint(
        new THREE.Vector3(
          e.x * p.x + u.x * p.y - offsetX,
          EAVE_HEIGHT + u.y * p.y,
          e.z * p.x + u.z * p.y - offsetZ,
        ),
      );
    }
    // Anchored to the ground so the walls are always in frame.
    box.expandByPoint(new THREE.Vector3(box.min.x, 0, box.min.z));
    box.expandByPoint(new THREE.Vector3(box.max.x, 0, box.max.z));
  }

  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 4);
  return { centre, radius };
}

/** Deterministic pseudo-random so the scenery is identical between mounts. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Scenery: trees, planting and a driveway
 * ------------------------------------------------------------------ */

function buildTree(scale: number, rand: () => number): THREE.Group {
  const tree = new THREE.Group();
  const trunkHeight = 1.5 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09 * scale, 0.15 * scale, trunkHeight, 8),
    new THREE.MeshStandardMaterial({ color: "#6b5343", roughness: 1 }),
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  tree.add(trunk);

  // Two species so the plot reads as planted rather than stamped.
  if (rand() < 0.34) {
    const coniferGreens = ["#3d6035", "#456b3b", "#365730"];
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry((0.92 - t * 0.46) * scale, (1.25 - t * 0.28) * scale, 9),
        new THREE.MeshStandardMaterial({
          color: coniferGreens[i % coniferGreens.length],
          roughness: 1,
          flatShading: true,
        }),
      );
      cone.position.y = trunkHeight * 0.6 + t * 0.82 * scale + 0.3 * scale;
      cone.castShadow = true;
      cone.receiveShadow = true;
      tree.add(cone);
    }
    return tree;
  }

  const greens = ["#4f7a45", "#597f4b", "#456e3f", "#527b48"];
  const blobs = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < blobs; i++) {
    const radius = (0.62 + rand() * 0.4) * scale;
    const foliage = new THREE.Mesh(
      // Detail 1 keeps the canopy faceted but no longer crystalline.
      new THREE.IcosahedronGeometry(radius, 1),
      new THREE.MeshStandardMaterial({
        color: greens[Math.floor(rand() * greens.length)],
        roughness: 0.95,
        flatShading: true,
      }),
    );
    foliage.position.set(
      (rand() - 0.5) * 0.7 * scale,
      trunkHeight + (0.35 + rand() * 0.8) * scale,
      (rand() - 0.5) * 0.7 * scale,
    );
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    tree.add(foliage);
  }
  return tree;
}

function buildScenery(): THREE.Group {
  const group = new THREE.Group();
  const rand = seededRandom(20240621);

  // Trees, placed in a loose ring well outside the compass readout.
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + rand() * 0.35;
    const radius = 27 + rand() * 24;
    const scale = 1.5 + rand() * 1.7;
    const tree = buildTree(scale, rand);
    tree.position.set(
      Math.sin(angle) * radius,
      0,
      -Math.cos(angle) * radius,
    );
    tree.rotation.y = rand() * Math.PI;
    group.add(tree);
  }

  // Low planting close to the house for scale reference.
  for (let i = 0; i < 16; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 11 + rand() * 6;
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45 + rand() * 0.5, 0),
      new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? "#5d7f4a" : "#517243",
        roughness: 1,
        flatShading: true,
      }),
    );
    bush.position.set(
      Math.sin(angle) * radius,
      0.28,
      -Math.cos(angle) * radius,
    );
    bush.castShadow = true;
    bush.receiveShadow = true;
    group.add(bush);
  }

  return group;
}

/* ------------------------------------------------------------------ *
 * The house: a wedge whose wall tops follow the roof plane
 * ------------------------------------------------------------------ */

interface HouseBuildInput {
  /** Wall polygon in roof local coordinates (already inset for the overhang). */
  wallPolygon: Point2[];
  /** World position of roof local (0,0,0). */
  origin: THREE.Vector3;
  /** Unit roof normal in world space. */
  normal: THREE.Vector3;
  roofMesh: THREE.Mesh;
  wallTexture: THREE.Texture;
}

/**
 * Walls are extruded straight up from the ground to the roof plane, so the
 * building reads as a real house at every pitch instead of a box with a slab
 * floating over it.
 */
function buildHouse({
  wallPolygon,
  origin,
  normal,
  roofMesh,
  wallTexture,
}: HouseBuildInput): THREE.Group {
  const house = new THREE.Group();

  // Horizontal (plan) position of each wall corner, and the roof height above it.
  const corners = wallPolygon.map((p, index) => {
    const world = roofMesh.localToWorld(new THREE.Vector3(p.x, p.y, 0));
    return { x: world.x, y: world.y, z: world.z, index };
  });

  // plane height: y = origin.y - (nx * dx + nz * dz) / ny
  const heightAt = (x: number, z: number) =>
    origin.y - (normal.x * (x - origin.x) + normal.z * (z - origin.z)) / normal.y;

  const positions: number[] = [];
  // UVs run along the wall in metres horizontally and height in metres
  // vertically, which is why the wall texture tiles at real-world scale.
  const uvs: number[] = [];
  let run = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const ay = heightAt(a.x, a.z);
    const by = heightAt(b.x, b.z);
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    // Two triangles per wall panel, wound counter-clockwise seen from outside.
    positions.push(
      a.x, 0, a.z,
      b.x, 0, b.z,
      b.x, by, b.z,
      a.x, 0, a.z,
      b.x, by, b.z,
      a.x, ay, a.z,
    );
    uvs.push(
      run, 0,
      run + span, 0,
      run + span, by,
      run, 0,
      run + span, by,
      run, ay,
    );
    run += span;
  }

  const wallGeometry = new THREE.BufferGeometry();
  wallGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  wallGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  wallGeometry.computeVertexNormals();

  const walls = new THREE.Mesh(
    wallGeometry,
    new THREE.MeshStandardMaterial({
      map: wallTexture,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  // Windows and a door give the walls a sense of scale.
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: "#f3f1ec",
    roughness: 0.6,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: "#7ea3bd",
    roughness: 0.12,
    metalness: 0.55,
  });
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: "#7d5a44",
    roughness: 0.7,
  });

  const centreX = corners.reduce((sum, c) => sum + c.x, 0) / corners.length;
  const centreZ = corners.reduce((sum, c) => sum + c.z, 0) / corners.length;

  let longestEdge = 0;
  let doorEdge = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > longestEdge) {
      longestEdge = length;
      doorEdge = i;
    }
  }

  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 2.2) continue;

    // Face the wall: pick the horizontal normal that points away from the plan
    // centroid, then yaw the panels to match.
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    let nx = dz / length;
    let nz = -dx / length;
    if ((midX - centreX) * nx + (midZ - centreZ) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const yaw = Math.atan2(nx, nz);

    // Sill height is kept constant so openings line up like a real facade.
    const sillY = 1.35;
    const usable = length - 1.6;
    const count = Math.max(1, Math.min(3, Math.floor(usable / 2.1)));
    for (let w = 0; w < count; w++) {
      const t = (w + 0.5) / count;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      if (i === doorEdge && count > 2 && w === 1) continue; // the door goes here
      const size = 1.0;
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(size + 0.16, size + 0.16, 0.08),
        frameMaterial,
      );
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, 0.1),
        glassMaterial,
      );
      for (const [mesh, outward] of [
        [frame, 0],
        [glass, 0.015],
      ] as [THREE.Mesh, number][]) {
        mesh.position.set(
          px + nx * outward,
          sillY + size / 2,
          pz + nz * outward,
        );
        mesh.rotation.y = yaw;
        mesh.receiveShadow = true;
        house.add(mesh);
      }
    }

    if (i === doorEdge && length > 3.2) {
      const px = a.x + dx * 0.5;
      const pz = a.z + dz * 0.5;
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 2.1, 0.1),
        doorMaterial,
      );
      door.position.set(px + nx * 0.02, 1.05, pz + nz * 0.02);
      door.rotation.y = yaw;
      door.receiveShadow = true;
      house.add(door);
    }
  }

  return house;
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function RoofScene(props: RoofSceneProps) {
  const {
    polygon,
    panels,
    shades,
    obstacles,
    tilt,
    azimuth,
    rackTilt,
    sunDirection,
    sunArc,
    arcLabels,
    mode,
    drawPoints,
    ghostPolygon,
    hoveredPanel,
    onAddDrawPoint,
    onHoverPanel,
    onPickObstacle,
    showSun,
    showHeatmap,
    view = "perspective",
  } = props;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneContext | null>(null);
  const cellsRef = useRef<THREE.InstancedMesh | null>(null);
  const hoverLineRef = useRef<THREE.Line | null>(null);
  const sunMarkerRef = useRef<THREE.Mesh | null>(null);
  const sunHaloRef = useRef<THREE.Sprite | null>(null);
  const hoverMetaRef = useRef({ standoff: 0.05, rackRad: 0 });

  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const handlers = useRef({ onAddDrawPoint, onPickObstacle, onHoverPanel });
  handlers.current = { onAddDrawPoint, onPickObstacle, onHoverPanel };

  const frame = useMemo(() => roofFrame(tilt, azimuth), [tilt, azimuth]);
  const tiltRad = (tilt * Math.PI) / 180;
  const rackRad = (rackTilt * Math.PI) / 180;
  const bounds = useMemo(
    () => roofWorldBounds(polygon, frame, tiltRad),
    [polygon, frame, tiltRad],
  );

  // Read through a ref so the sun view can follow the live sun without the
  // preset effect re-running on every sweep frame and re-tweening the camera.
  const sunDirRef = useRef(sunDirection);
  sunDirRef.current = sunDirection;

  /* -------------------------------------------------------------- *
   * Renderer bootstrap (runs once)
   * -------------------------------------------------------------- */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglError("This browser could not start WebGL.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || 800, mount.clientHeight || 600);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#cfdae4", 70, 210);

    const camera = new THREE.PerspectiveCamera(
      42,
      (mount.clientWidth || 800) / (mount.clientHeight || 600),
      0.1,
      600,
    );
    camera.position.set(15, 11, 17);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 5;
    controls.maxDistance = 90;
    controls.target.set(0, 3.4, 0);
    controls.update();

    // Sky dome with a vertical gradient so the scene has weather, not a flat fill.
    const skyTexture = makeSkyTexture();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(260, 32, 20),
      new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide,
        fog: false,
      }),
    );
    scene.add(sky);

    // Image-based lighting. A throwaway sky+ground scene is baked into an
    // environment map so the glass modules and aluminium frames have something
    // real to reflect; without it, metallic surfaces render as flat black.
    const envScene = new THREE.Scene();
    envScene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(50, 24, 16),
        new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide }),
      ),
    );
    const envGround = new THREE.Mesh(
      new THREE.CircleGeometry(60, 24),
      new THREE.MeshBasicMaterial({ color: 0x87977b, side: THREE.DoubleSide }),
    );
    envGround.rotation.x = -Math.PI / 2;
    envGround.position.y = -3;
    envScene.add(envGround);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
    // Free the probe's own geometry/material but leave the shared sky texture
    // alone — the main sky dome still uses it.
    envScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });

    // Ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(200, 72),
      new THREE.MeshStandardMaterial({
        map: makeGroundTexture(),
        roughness: 1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // Mown outline around the house so the plot reads as a garden.
    const lawn = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({
        color: "#9fb98a",
        roughness: 1,
        transparent: true,
        opacity: 0.55,
      }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.005;
    lawn.receiveShadow = true;
    scene.add(lawn);

    const grid = new THREE.GridHelper(90, 45, 0xa9b2a0, 0xbcc4b4);
    grid.position.y = 0.012;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.22;
    scene.add(grid);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(19, 19.16, 96),
      new THREE.MeshBasicMaterial({
        color: 0x8d9683,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    scene.add(ring);

    for (const [text, azimuthDeg] of [
      ["N", 0],
      ["E", 90],
      ["S", 180],
      ["W", 270],
    ] as [string, number][]) {
      const sprite = makeLabelSprite(text);
      const rad = (azimuthDeg * Math.PI) / 180;
      sprite.position.set(Math.sin(rad) * 21.5, 0.7, -Math.cos(rad) * 21.5);
      scene.add(sprite);
    }

    scene.add(buildScenery());

    const hemi = new THREE.HemisphereLight(0xdceaff, 0xa8b48c, 0.95);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));

    const sunLight = new THREE.DirectionalLight(0xfff0d2, 3);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 180;
    sunLight.shadow.camera.left = -26;
    sunLight.shadow.camera.right = 26;
    sunLight.shadow.camera.top = 26;
    sunLight.shadow.camera.bottom = -26;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.03;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const sunGroup = new THREE.Group();
    scene.add(sunGroup);

    const roofGroup = new THREE.Group();
    scene.add(roofGroup);

    const pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    roofGroup.add(pickPlane);

    const context: SceneContext = {
      renderer,
      scene,
      camera,
      controls,
      roofGroup,
      pickPlane,
      sunLight,
      sunGroup,
      hemi,
      mode,
      panelPicks: [],
      panelTexture: makePanelTexture(),
      shingleTexture: makeShingleTexture(),
      wallTexture: makeWallTexture(),
      cameraGoal: null,
      build: null,
      framesMesh: null,
    };
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    context.panelTexture.anisotropy = Math.min(8, maxAnisotropy);
    context.shingleTexture.anisotropy = Math.min(8, maxAnisotropy);
    context.wallTexture.anisotropy = Math.min(8, maxAnisotropy);
    sceneRef.current = context;
    setReady(true);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = { x: 0, y: 0 };

    const localPoint = (event: PointerEvent): Point2 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(pickPlane, false);
      if (!hits.length) return null;
      const local = roofGroup.worldToLocal(hits[0].point.clone());
      return { x: local.x, y: local.y };
    };

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
      // Let a manual drag win immediately over any preset camera tween.
      context.cameraGoal = null;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 6) return;
      const point = localPoint(event);
      if (!point) return;
      if (context.mode === "draw") handlers.current.onAddDrawPoint(point);
      else if (context.mode === "obstacle") handlers.current.onPickObstacle(point);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (context.mode !== "orbit") {
        renderer.domElement.style.cursor = "default";
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(context.panelPicks, false);
      const id = hits.length
        ? ((hits[0].object.userData.panelId as string | undefined) ?? null)
        : null;
      handlers.current.onHoverPanel(id);
      renderer.domElement.style.cursor = id ? "pointer" : "grab";
    };

    const onPointerLeave = () => handlers.current.onHoverPanel(null);

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    let raf = 0;
    const riseTmp = new THREE.Matrix4();
    const scratch = new THREE.Matrix4();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.enabled = context.mode === "orbit";

      // Ease the camera into a preset framing, then hand control back.
      const goal = context.cameraGoal;
      if (goal) {
        camera.position.lerp(goal.position, 0.085);
        controls.target.lerp(goal.target, 0.085);
        if (camera.position.distanceTo(goal.position) < 0.05) {
          camera.position.copy(goal.position);
          controls.target.copy(goal.target);
          context.cameraGoal = null;
        }
      }

      // Modules drop onto the roof whenever the layout changes.
      const build = context.build;
      const framesMesh = context.framesMesh;
      if (build && cellsRef.current && framesMesh) {
        const elapsed = performance.now() - build.start;
        let finished = true;
        for (let i = 0; i < build.cells.length; i++) {
          const t = THREE.MathUtils.clamp((elapsed - i * 9) / 380, 0, 1);
          if (t < 1) finished = false;
          const eased = 1 - Math.pow(1 - t, 3);
          riseTmp.makeTranslation(0, 0, (1 - eased) * 0.9);
          scratch.copy(build.cells[i]).premultiply(riseTmp);
          cellsRef.current.setMatrixAt(i, scratch);
          scratch.copy(build.frames[i]).premultiply(riseTmp);
          framesMesh.setMatrixAt(i, scratch);
        }
        cellsRef.current.instanceMatrix.needsUpdate = true;
        framesMesh.instanceMatrix.needsUpdate = true;
        if (finished) context.build = null;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      scene.remove(roofGroup);
      scene.remove(sunGroup);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.mode = mode;
  }, [mode]);

  /* -------------------------------------------------------------- *
   * Roof slab, eaves and house body
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;
    const { roofGroup, scene } = ctx;

    for (const child of [...roofGroup.children]) {
      if (child === ctx.pickPlane) continue;
      roofGroup.remove(child);
      disposeObject(child);
    }
    if (polygon.length < 3) return;

    const minX = Math.min(...polygon.map((p) => p.x));
    const maxX = Math.max(...polygon.map((p) => p.x));
    const minY = Math.min(...polygon.map((p) => p.y));
    const maxY = Math.max(...polygon.map((p) => p.y));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const e = new THREE.Vector3(frame.eaves.x, frame.eaves.y, frame.eaves.z);
    const u = new THREE.Vector3(frame.upSlope.x, frame.upSlope.y, frame.upSlope.z);
    const n = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);

    // Centre the plan footprint on the world origin. Up-slope distance is
    // converted to its horizontal projection before being used as an offset.
    const cosTilt = Math.max(0.25, Math.cos(tiltRad));
    const planX = (p: Point2) => e.x * p.x + (u.x / cosTilt) * p.y;
    const planZ = (p: Point2) => e.z * p.x + (u.z / cosTilt) * p.y;
    const offsetX = planX({ x: cx, y: cy });
    const offsetZ = planZ({ x: cx, y: cy });

    roofGroup.matrixAutoUpdate = false;
    roofGroup.matrix.makeBasis(e, u, n);
    roofGroup.matrix.setPosition(-offsetX, EAVE_HEIGHT, -offsetZ);
    roofGroup.matrixWorldNeedsUpdate = true;
    roofGroup.updateMatrixWorld(true);

    // Roof slab with real thickness, so the eave reads as a physical edge.
    const slabGeometry = new THREE.ExtrudeGeometry(
      (() => {
        const shape = new THREE.Shape();
        polygon.forEach((p, index) => {
          if (index === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        shape.closePath();
        return shape;
      })(),
      { depth: ROOF_THICKNESS, bevelEnabled: false },
    );
    slabGeometry.translate(0, 0, -ROOF_THICKNESS);
    // ExtrudeGeometry splits into two material groups — the coplanar faces and
    // the extruded edge — so the eave gets its own painted fascia board and the
    // roof edge reads as a finished detail rather than exposed slab.
    const roofMesh = new THREE.Mesh(slabGeometry, [
      new THREE.MeshStandardMaterial({
        // Roof UVs are in metres, so the shingle courses tile at real scale.
        map: ctx.shingleTexture,
        roughness: 0.95,
        metalness: 0,
      }),
      new THREE.MeshStandardMaterial({
        color: "#e9e6df",
        roughness: 0.62,
        metalness: 0.02,
      }),
    ]);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    roofGroup.add(roofMesh);

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(
      [...polygon, polygon[0]].map((p) => new THREE.Vector3(p.x, p.y, 0.01)),
    );
    roofGroup.add(
      new THREE.Line(
        outlineGeometry,
        new THREE.LineBasicMaterial({ color: 0xf2b93f }),
      ),
    );

    // Walls sit inset from the roof edge, so the slab overhangs like an eave.
    const centroid = {
      x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
      y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length,
    };
    const wallPolygon = polygon.map((p) => {
      const dx = p.x - centroid.x;
      const dy = p.y - centroid.y;
      const len = Math.hypot(dx, dy) || 1;
      return {
        x: p.x - (dx / len) * EAVES_OVERHANG,
        y: p.y - (dy / len) * EAVES_OVERHANG,
      };
    });

    const origin = new THREE.Vector3();
    roofMesh.updateMatrixWorld(true);
    roofGroup.getWorldPosition(origin);
    const worldNormal = n.clone().normalize();

    const house = buildHouse({
      wallPolygon,
      origin,
      normal: worldNormal,
      roofMesh,
      wallTexture: ctx.wallTexture,
    });
    scene.add(house);

    return () => {
      scene.remove(house);
      disposeObject(house);
    };
  }, [frame, polygon, tiltRad, ready]);

  /* -------------------------------------------------------------- *
   * Modules + obstructions
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;
    const group = new THREE.Group();
    ctx.roofGroup.add(group);

    // A flush module sits just proud of the roof. A racked one pivots on its
    // low edge, so it can never swing down through the roof surface.
    const moduleStandoff = 0.05;
    const rackCos = Math.cos(rackRad);
    const rackSin = Math.sin(rackRad);

    if (panels.length > 0) {
      const moduleLength = panels[0].h;

      const frames = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: "#9ba4ae",
          roughness: 0.36,
          metalness: 0.55,
          envMapIntensity: 1.1,
        }),
        panels.length,
      );
      const cells = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          map: ctx.panelTexture,
          // Instanced colours multiply the base colour, so this has to stay
          // white — setting it to the panel blue as well squares the darkness
          // and the modules render effectively black.
          color: "#ffffff",
          roughness: 0.26,
          metalness: 0.22,
          envMapIntensity: 1.6,
        }),
        panels.length,
      );
      frames.castShadow = true;
      frames.receiveShadow = true;
      cells.castShadow = true;
      cells.receiveShadow = true;

      const dummy = new THREE.Object3D();
      const cellMatrices: THREE.Matrix4[] = [];
      const frameMatrices: THREE.Matrix4[] = [];
      panels.forEach((panel, index) => {
        const centreX = panel.x + panel.w / 2;
        const centreY = panel.y + (moduleLength / 2) * rackCos;
        const centreZ = moduleStandoff + (moduleLength / 2) * rackSin;

        dummy.position.set(centreX, centreY, centreZ);
        dummy.rotation.set(rackRad, 0, 0);
        dummy.scale.set(panel.w - 0.03, moduleLength - 0.03, 0.035);
        dummy.updateMatrix();
        cells.setMatrixAt(index, dummy.matrix);
        cellMatrices.push(dummy.matrix.clone());

        dummy.position.set(centreX, centreY, centreZ - 0.03);
        dummy.scale.set(panel.w, moduleLength, 0.03);
        dummy.updateMatrix();
        frames.setMatrixAt(index, dummy.matrix);
        frameMatrices.push(dummy.matrix.clone());

        cells.setColorAt(index, new THREE.Color("#ffffff"));
      });

      cells.instanceMatrix.needsUpdate = true;
      frames.instanceMatrix.needsUpdate = true;
      group.add(frames, cells);
      cellsRef.current = cells;
      ctx.framesMesh = frames;
      // Restart the rise-in so a new layout visibly assembles itself.
      ctx.build = {
        start: performance.now(),
        cells: cellMatrices,
        frames: frameMatrices,
      };

      hoverMetaRef.current = {
        standoff: moduleStandoff,
        rackRad,
      };

      // Invisible quads for hover picking (instanced meshes raycast poorly).
      panels.forEach((panel) => {
        const pick = new THREE.Mesh(
          new THREE.PlaneGeometry(panel.w, moduleLength),
          new THREE.MeshBasicMaterial({
            visible: false,
            side: THREE.DoubleSide,
          }),
        );
        pick.position.set(
          panel.x + panel.w / 2,
          panel.y + (moduleLength / 2) * rackCos,
          moduleStandoff + (moduleLength / 2) * rackSin + 0.05,
        );
        pick.rotation.set(rackRad, 0, 0);
        pick.userData.panelId = panel.id;
        group.add(pick);
      });
    }

    // Roof penetrations are drawn as real vent stacks rather than raw boxes.
    // The shading model still uses the full footprint (slightly conservative),
    // so what casts the shadow here stays honest to the physics.
    const stackMaterial = new THREE.MeshStandardMaterial({
      color: "#b3bbc5",
      roughness: 0.3,
      metalness: 0.75,
      envMapIntensity: 1.2,
    });
    for (const obstacle of obstacles) {
      const height = Math.max(obstacle.height, 0.1);
      const radius = Math.max(0.08, Math.min(obstacle.w, obstacle.h) / 2);
      const stack = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.78, radius * 0.92, height, 20),
        stackMaterial,
      );
      body.position.y = height / 2;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.07, 20),
        stackMaterial,
      );
      collar.position.y = 0.035;

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, 0.05, 20),
        stackMaterial,
      );
      cap.position.y = height;

      stack.add(body, collar, cap);
      stack.traverse((child) => {
        child.castShadow = true;
        child.receiveShadow = true;
      });
      // Cylinders are built along +Y; the roof plane's up axis is local +Z.
      stack.rotation.x = Math.PI / 2;
      stack.position.set(
        obstacle.x + obstacle.w / 2,
        obstacle.y + obstacle.h / 2,
        0,
      );
      group.add(stack);
    }

    ctx.panelPicks = group.children.filter(
      (child) => child.userData.panelId !== undefined,
    );

    return () => {
      ctx.roofGroup.remove(group);
      disposeObject(group);
      ctx.panelPicks = [];
      cellsRef.current = null;
      ctx.framesMesh = null;
      ctx.build = null;
      hoverLineRef.current = null;
    };
  }, [panels, obstacles, rackRad, ready]);

  /* -------------------------------------------------------------- *
   * Yield colouring (colours only, no geometry rebuilds)
   * -------------------------------------------------------------- */
  useEffect(() => {
    const cells = cellsRef.current;
    if (!cells) return;
    const material = cells.material as THREE.MeshStandardMaterial;
    // Two genuinely different views: realistic textured modules, or an analytic
    // heat map where the instance colour is the whole story. Swapping the map
    // out in heat-map mode keeps the ramp from being muddied by the cell grid.
    const wantedMap = showHeatmap ? null : (sceneRef.current?.panelTexture ?? null);
    if (material.map !== wantedMap) {
      material.map = wantedMap;
      material.needsUpdate = true;
    }
    material.roughness = showHeatmap ? 0.6 : 0.26;
    material.metalness = showHeatmap ? 0.05 : 0.22;

    const base = new THREE.Color("#ffffff");
    panels.forEach((_, index) => {
      const lit = 1 - (shades[index] ?? 0);
      cells.setColorAt(index, showHeatmap ? heatColour(lit) : base);
    });
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
  }, [shades, showHeatmap, panels, ready]);

  /* -------------------------------------------------------------- *
   * Camera presets: perspective / top-down / the sun's own eye
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;

    const { centre, radius } = bounds;
    const sun = sunDirRef.current;
    const useSun = view === "sun" && sun.y > 0.1;
    const direction =
      view === "top"
        ? new THREE.Vector3(0.0001, 1, 0.0001)
        : useSun
          ? new THREE.Vector3(sun.x, sun.y, sun.z)
          : new THREE.Vector3(0.62, 0.5, 0.62);
    direction.normalize();

    // Distances chosen so the model's bounding box fills ~90% of the frame at
    // every pitch; verified in scripts/verify-framing.ts.
    const distance = radius * (view === "top" ? 3.1 : 3);
    const goal = {
      position: centre.clone().addScaledVector(direction, distance),
      target: centre.clone(),
    };
    ctx.cameraGoal = goal;
  }, [view, bounds, ready]);

  /* -------------------------------------------------------------- *
   * Hover highlight
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const previous = hoverLineRef.current;
    if (previous) {
      previous.parent?.remove(previous);
      disposeObject(previous);
      hoverLineRef.current = null;
    }
    const active = panels.find((panel) => panel.id === hoveredPanel);
    if (!active) return;

    const { standoff, rackRad: hoverRack } = hoverMetaRef.current;
    // Same placement maths as the instanced cell, so the outline lands exactly
    // on the module: pivot on the low edge and rotate about the eaves axis.
    const centreX = active.x + active.w / 2;
    const centreY = active.y + (active.h / 2) * Math.cos(hoverRack);
    const centreZ = standoff + (active.h / 2) * Math.sin(hoverRack);
    const half = { x: active.w / 2, y: active.h / 2 };
    const corners: [number, number][] = [
      [-half.x, -half.y],
      [half.x, -half.y],
      [half.x, half.y],
      [-half.x, half.y],
      [-half.x, -half.y],
    ];
    const points = corners.map(([dx, dy]) =>
      new THREE.Vector3(
        centreX + dx,
        centreY + dy * Math.cos(hoverRack),
        centreZ + dy * Math.sin(hoverRack) + 0.035,
      ),
    );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    ctx.roofGroup.add(line);
    hoverLineRef.current = line;
  }, [hoveredPanel, panels, ready, rackTilt]);

  /* -------------------------------------------------------------- *
   * Drawing preview
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;
    if (drawPoints.length === 0 && ghostPolygon.length < 3) return;

    const group = new THREE.Group();
    ctx.roofGroup.add(group);

    if (ghostPolygon.length >= 3) {
      const shape = new THREE.Shape();
      ghostPolygon.forEach((p, index) => {
        if (index === 0) shape.moveTo(p.x, p.y);
        else shape.lineTo(p.x, p.y);
      });
      shape.closePath();
      const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: 0xf2b93f,
          transparent: true,
          opacity: 0.26,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      fill.position.z = 0.06;
      group.add(fill);
    }

    if (drawPoints.length > 0) {
      const pts = drawPoints.map((p) => new THREE.Vector3(p.x, p.y, 0.08));
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xf2b93f }),
        ),
      );
      const dotGeometry = new THREE.SphereGeometry(0.07, 14, 10);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x1f2937 });
      for (const point of pts) {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.copy(point);
        group.add(dot);
      }
      if (drawPoints.length > 2) {
        const closing = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]),
          new THREE.LineDashedMaterial({
            color: 0xf2b93f,
            dashSize: 0.14,
            gapSize: 0.09,
            transparent: true,
            opacity: 0.55,
          }),
        );
        closing.computeLineDistances();
        group.add(closing);
      }
    }

    return () => {
      ctx.roofGroup.remove(group);
      disposeObject(group);
    };
  }, [drawPoints, ghostPolygon, ready]);

  /* -------------------------------------------------------------- *
   * Sun arc: rebuilt only when the day or the site changes
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;

    for (const child of [...ctx.sunGroup.children]) {
      ctx.sunGroup.remove(child);
      disposeObject(child);
    }
    sunMarkerRef.current = null;
    sunHaloRef.current = null;
    if (!showSun) return;

    if (sunArc.length > 1) {
      const curve = new THREE.CatmullRomCurve3(
        sunArc.map((p) =>
          new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(SUN_RADIUS),
        ),
      );
      ctx.sunGroup.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 140, 0.04, 8, false),
          new THREE.MeshBasicMaterial({
            color: 0xeda23c,
            transparent: true,
            opacity: 0.72,
            fog: false,
          }),
        ),
      );
    }

    for (const label of arcLabels) {
      const sprite = makeLabelSprite(label.text, "#9c7526");
      sprite.position
        .set(label.direction.x, label.direction.y, label.direction.z)
        .multiplyScalar(SUN_RADIUS * 1.04);
      sprite.scale.set(2.6, 1.3, 1);
      ctx.sunGroup.add(sprite);
    }

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xffd479, fog: false }),
    );
    ctx.sunGroup.add(marker);
    sunMarkerRef.current = marker;

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    halo.scale.setScalar(11);
    ctx.sunGroup.add(halo);
    sunHaloRef.current = halo;
  }, [sunArc, arcLabels, showSun, ready]);

  /* -------------------------------------------------------------- *
   * Sun position + shadow direction, updated every sweep frame
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;

    const dir = new THREE.Vector3(sunDirection.x, sunDirection.y, sunDirection.z);
    const isUp = sunDirection.y > -0.05;
    ctx.sunLight.position.copy(dir).multiplyScalar(80);
    ctx.sunLight.intensity = isUp ? 3 : 0.02;
    ctx.hemi.intensity = isUp ? 0.95 : 0.42;

    const marker = sunMarkerRef.current;
    const halo = sunHaloRef.current;
    if (marker) {
      marker.visible = isUp;
      marker.position.copy(dir).multiplyScalar(SUN_RADIUS);
    }
    if (halo) {
      halo.visible = isUp;
      halo.position.copy(dir).multiplyScalar(SUN_RADIUS);
    }
  }, [sunDirection, ready]);

  const cursorClass =
    mode === "draw"
      ? "cursor-crosshair"
      : mode === "obstacle"
        ? "cursor-copy"
        : "cursor-grab";

  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className={`size-full ${cursorClass}`} />
      {webglError && (
        <div className="absolute inset-0 grid place-items-center bg-muted/90 p-6 text-center text-sm text-muted-foreground">
          {webglError}
        </div>
      )}
    </div>
  );
}
