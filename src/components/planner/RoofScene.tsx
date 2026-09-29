/**
 * The 3D planner scene.
 *
 * Everything the homeowner sees lives here: the roof surface they trace, the
 * modules laid out on it, the obstructions that shade them, and the sun's real
 * path for the selected day with live shadows.
 *
 * Coordinate note: `roofGroup` carries the roof-plane basis matrix, so every
 * child is positioned in roof local coordinates (+X along the eaves,
 * +Y up the slope, +Z along the roof normal) with no manual basis maths.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Vec3 } from "@/lib/solar";
import type { Obstacle, Panel, Point2 } from "@/lib/roof";
import { roofFrame } from "@/lib/roof";

export type SceneMode = "orbit" | "draw" | "obstacle";

interface RoofSceneProps {
  polygon: Point2[];
  /** Geometry only. Shading is applied separately so the array can stay
   *  referentially stable while the sun is being scrubbed. */
  panels: Panel[];
  shades: number[];
  obstacles: Obstacle[];
  tilt: number;
  azimuth: number;
  /** Tilt of the modules above the roof plane, degrees. Zero = flush. */
  rackTilt: number;
  sunDirection: Vec3;
  /** Sun positions across the day, for the sky arc. */
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
}

const EAVE_HEIGHT = 2.9;
const EAVES_OVERHANG = 0.45;
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
}

function shapeFromPoints(points: Point2[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach((p, index) => {
    if (index === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  return shape;
}

function makeLabelSprite(text: string, color = "#8b94a3"): THREE.Sprite {
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
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }),
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
  gradient.addColorStop(0, "rgba(255,216,138,0.95)");
  gradient.addColorStop(0.32, "rgba(255,190,80,0.34)");
  gradient.addColorStop(1, "rgba(255,190,80,0)");
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
      spriteMaterial.map?.dispose();
      material.dispose();
    }
  });
}

/** Lit fraction -> colour ramp: deep indigo (shaded) through amber (full sun). */
function heatColour(lit: number): THREE.Color {
  const t = THREE.MathUtils.clamp(lit, 0, 1);
  return new THREE.Color().setHSL(0.66 - 0.57 * t, 0.18 + 0.55 * t, 0.16 + 0.44 * t);
}

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
  } = props;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneContext | null>(null);
  const cellsRef = useRef<THREE.InstancedMesh | null>(null);
  const hoverLineRef = useRef<THREE.Line | null>(null);
  const sunMarkerRef = useRef<THREE.Mesh | null>(null);
  const sunHaloRef = useRef<THREE.Sprite | null>(null);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Latest callbacks, read from the native pointer handlers.
  const handlers = useRef({ onAddDrawPoint, onPickObstacle, onHoverPanel });
  handlers.current = { onAddDrawPoint, onPickObstacle, onHoverPanel };

  const frame = useMemo(() => roofFrame(tilt, azimuth), [tilt, azimuth]);
  const tiltRad = (tilt * Math.PI) / 180;
  const rackRad = (rackTilt * Math.PI) / 180;
  const hoverStandoffRef = useRef(0.05);

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
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eaeef2");
    scene.fog = new THREE.Fog("#eaeef2", 80, 190);

    const camera = new THREE.PerspectiveCamera(
      42,
      (mount.clientWidth || 800) / (mount.clientHeight || 600),
      0.1,
      500,
    );
    camera.position.set(14, 11, 16);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.target.set(0, 3.2, 0);
    controls.update();

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(220, 32, 16),
      new THREE.MeshBasicMaterial({
        color: "#e6ebf1",
        side: THREE.BackSide,
        fog: false,
      }),
    );
    scene.add(dome);

    const groundCanvas = document.createElement("canvas");
    groundCanvas.width = 512;
    groundCanvas.height = 512;
    const gctx = groundCanvas.getContext("2d")!;
    const gradient = gctx.createRadialGradient(256, 256, 16, 256, 256, 256);
    gradient.addColorStop(0, "#e3e7ec");
    gradient.addColorStop(0.5, "#d5dae1");
    gradient.addColorStop(1, "#c3c9d1");
    gctx.fillStyle = gradient;
    gctx.fillRect(0, 0, 512, 512);
    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(150, 64),
      new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(90, 45, 0xaeb6c1, 0xc6ccd5);
    grid.position.y = 0.006;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.3;
    scene.add(grid);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(21.5, 21.7, 96),
      new THREE.MeshBasicMaterial({
        color: 0x98a1ac,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    for (const [text, azimuthDeg] of [
      ["N", 0],
      ["E", 90],
      ["S", 180],
      ["W", 270],
    ] as [string, number][]) {
      const sprite = makeLabelSprite(text);
      const rad = (azimuthDeg * Math.PI) / 180;
      sprite.position.set(Math.sin(rad) * 24.5, 0.5, -Math.cos(rad) * 24.5);
      scene.add(sprite);
    }

    const hemi = new THREE.HemisphereLight(0xe3ecff, 0xb6a996, 1.3);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const sunLight = new THREE.DirectionalLight(0xfff3dd, 2.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.025;
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
    };
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
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.enabled = context.mode === "orbit";
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
   * Roof surface + house
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;
    const { roofGroup, scene } = ctx;

    // Keep the pick plane, drop everything else.
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

    // Centre the plan footprint on the world origin, eave line at EAVE_HEIGHT.
    const cosTilt = Math.max(0.2, Math.cos(tiltRad));
    const offsetX = e.x * cx + (u.x / cosTilt) * cy;
    const offsetZ = e.z * cx + (u.z / cosTilt) * cy;

    roofGroup.matrixAutoUpdate = false;
    roofGroup.matrix.makeBasis(e, u, n);
    roofGroup.matrix.setPosition(-offsetX, EAVE_HEIGHT, -offsetZ);
    roofGroup.matrixWorldNeedsUpdate = true;

    const roofMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shapeFromPoints(polygon)),
      new THREE.MeshStandardMaterial({
        color: "#59616f",
        roughness: 0.94,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    roofMesh.position.z = 0.004;
    roofMesh.receiveShadow = true;
    roofGroup.add(roofMesh);

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(
      [...polygon, polygon[0]].map((p) => new THREE.Vector3(p.x, p.y, 0.015)),
    );
    roofGroup.add(
      new THREE.Line(
        outlineGeometry,
        new THREE.LineBasicMaterial({ color: 0xf2b93f }),
      ),
    );

    // Plan footprint of the roof, in world horizontal coordinates.
    const plan = polygon.map((p) => ({
      x: e.x * p.x + u.x * p.y - offsetX,
      z: e.z * p.x + u.z * p.y - offsetZ,
    }));
    const centre = plan.reduce(
      (acc, p) => ({
        x: acc.x + p.x / plan.length,
        z: acc.z + p.z / plan.length,
      }),
      { x: 0, z: 0 },
    );
    const overhangPlan = plan.map((p) => {
      const dx = p.x - centre.x;
      const dz = p.z - centre.z;
      const len = Math.hypot(dx, dz) || 1;
      return {
        x: p.x + (dx / len) * EAVES_OVERHANG,
        z: p.z + (dz / len) * EAVES_OVERHANG,
      };
    });

    // A 2D shape is always planar in XY, so standing it up maps shape-Y onto
    // world-Z. Building the shape as (-X, Z) and then rotating by X then Y
    // lands the footprint back on the roof while keeping the winding (and so
    // the face normals) intact.
    const wallShape = new THREE.Shape();
    overhangPlan.forEach((p, index) => {
      if (index === 0) wallShape.moveTo(-p.x, p.z);
      else wallShape.lineTo(-p.x, p.z);
    });
    wallShape.closePath();

    const wallGeometry = new THREE.ExtrudeGeometry(wallShape, {
      depth: EAVE_HEIGHT,
      bevelEnabled: false,
    });
    wallGeometry.rotateX(-Math.PI / 2);
    wallGeometry.rotateY(Math.PI);
    const walls = new THREE.Mesh(
      wallGeometry,
      new THREE.MeshStandardMaterial({
        color: "#e8e4de",
        roughness: 0.88,
        metalness: 0,
      }),
    );
    walls.castShadow = true;
    walls.receiveShadow = true;
    scene.add(walls);

    return () => {
      scene.remove(walls);
      disposeObject(walls);
    };
  }, [frame, polygon, tiltRad, ready]);

  /* -------------------------------------------------------------- *
   * Panels + obstructions
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;
    const group = new THREE.Group();
    ctx.roofGroup.add(group);

    const e = new THREE.Vector3(frame.eaves.x, frame.eaves.y, frame.eaves.z);
    const u = new THREE.Vector3(frame.upSlope.x, frame.upSlope.y, frame.upSlope.z);
    const basis = new THREE.Matrix4().makeBasis(e, u, new THREE.Vector3(
      frame.normal.x,
      frame.normal.y,
      frame.normal.z,
    ));
    const dummy = new THREE.Object3D();

    if (panels.length > 0) {
      // A flush module sits a few centimetres proud of the roof; a racked one
      // is lifted by half its length times the sine of the rack angle.
      const moduleLength = panels[0].h;
      const moduleCentreHeight =
        (moduleLength / 2) * Math.sin(rackRad) + 0.04;
      const standoff = moduleCentreHeight + 0.02;

      const frames = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: "#31363f",
          roughness: 0.42,
          metalness: 0.7,
        }),
        panels.length,
      );
      const cells = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          roughness: 0.26,
          metalness: 0.4,
        }),
        panels.length,
      );
      frames.castShadow = true;
      frames.receiveShadow = true;
      cells.castShadow = true;
      cells.receiveShadow = true;

      panels.forEach((panel, index) => {
        dummy.position.set(
          panel.x + panel.w / 2,
          panel.y + panel.h / 2,
          standoff,
        );
        // Rotating about the local X (the eaves) tips the module up on its rack.
        dummy.quaternion.setFromRotationMatrix(basis);
        dummy.rotateX(-rackRad);
        dummy.scale.set(panel.w, panel.h, 0.05);
        dummy.updateMatrix();
        cells.setMatrixAt(index, dummy.matrix);

        dummy.position.set(
          panel.x + panel.w / 2,
          panel.y + panel.h / 2,
          standoff - 0.028,
        );
        dummy.scale.set(panel.w + 0.05, panel.h + 0.05, 0.03);
        dummy.updateMatrix();
        frames.setMatrixAt(index, dummy.matrix);

        cells.setColorAt(
          index,
          new THREE.Color("#16294a"),
        );
      });

      cells.instanceMatrix.needsUpdate = true;
      frames.instanceMatrix.needsUpdate = true;
      group.add(frames, cells);
      cellsRef.current = cells;

      // Invisible quads for hover picking (instanced meshes raycast poorly).
      panels.forEach((panel) => {
        const pick = new THREE.Mesh(
          new THREE.PlaneGeometry(panel.w, panel.h),
          new THREE.MeshBasicMaterial({
            visible: false,
            side: THREE.DoubleSide,
          }),
        );
        pick.position.set(
          panel.x + panel.w / 2,
          panel.y + panel.h / 2,
          standoff + 0.08,
        );
        pick.quaternion.setFromRotationMatrix(basis);
        pick.rotateX(-rackRad);
        pick.userData.panelId = panel.id;
        group.add(pick);
      });

      hoverStandoffRef.current = standoff;
    }

    for (const obstacle of obstacles) {
      const height = Math.max(obstacle.height, 0.1);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(obstacle.w, obstacle.h, height),
        new THREE.MeshStandardMaterial({
          color: "#8b93a1",
          roughness: 0.55,
          metalness: 0.3,
        }),
      );
      box.position.set(
        obstacle.x + obstacle.w / 2,
        obstacle.y + obstacle.h / 2,
        height / 2,
      );
      box.quaternion.setFromRotationMatrix(basis);
      box.castShadow = true;
      box.receiveShadow = true;
      group.add(box);
    }

    ctx.panelPicks = group.children.filter(
      (child) => child.userData.panelId !== undefined,
    );

    return () => {
      ctx.roofGroup.remove(group);
      disposeObject(group);
      ctx.panelPicks = [];
      cellsRef.current = null;
      hoverLineRef.current = null;
    };
  }, [panels, obstacles, frame, tiltRad, rackRad, ready]);

  /* -------------------------------------------------------------- *
   * Yield colouring (cheap: colours only, no rebuilds)
   * -------------------------------------------------------------- */
  useEffect(() => {
    const cells = cellsRef.current;
    if (!cells) return;
    const base = new THREE.Color("#16294a");
    panels.forEach((_, index) => {
      const lit = 1 - (shades[index] ?? 0);
      cells.setColorAt(index, showHeatmap ? heatColour(lit) : base);
    });
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
  }, [shades, showHeatmap, panels, ready]);

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

    const z = hoverStandoffRef.current + 0.12;
    const corners: [number, number][] = [
      [active.x, active.y],
      [active.x + active.w, active.y],
      [active.x + active.w, active.y + active.h],
      [active.x, active.y + active.h],
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        [...corners, corners[0]].map(
          ([x, y]) => new THREE.Vector3(x, y, z),
        ),
      ),
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
      const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shapeFromPoints(ghostPolygon)),
        new THREE.MeshBasicMaterial({
          color: 0xf2b93f,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      fill.position.z = 0.03;
      group.add(fill);
    }

    if (drawPoints.length > 0) {
      const pts = drawPoints.map((p) => new THREE.Vector3(p.x, p.y, 0.05));
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xf2b93f }),
        ),
      );
      const dotGeometry = new THREE.SphereGeometry(0.06, 14, 10);
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
   * Sun: the arc is rebuilt only when the day or the site changes.
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
          new THREE.TubeGeometry(curve, 140, 0.035, 8, false),
          new THREE.MeshBasicMaterial({
            color: 0xeda23c,
            transparent: true,
            opacity: 0.7,
            fog: false,
          }),
        ),
      );
    }

    for (const label of arcLabels) {
      const sprite = makeLabelSprite(label.text, "#9c7526");
      sprite.position
        .set(label.direction.x, label.direction.y, label.direction.z)
        .multiplyScalar(SUN_RADIUS * 1.03);
      sprite.scale.set(2.6, 1.3, 1);
      ctx.sunGroup.add(sprite);
    }

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 24, 18),
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
    halo.scale.setScalar(8);
    ctx.sunGroup.add(halo);
    sunHaloRef.current = halo;
  }, [sunArc, arcLabels, showSun, ready]);

  /* -------------------------------------------------------------- *
   * Sun position + shadow direction, updated every frame of the sweep
   * -------------------------------------------------------------- */
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !ready) return;

    const dir = new THREE.Vector3(sunDirection.x, sunDirection.y, sunDirection.z);
    const isUp = sunDirection.y > -0.05;
    ctx.sunLight.position.copy(dir).multiplyScalar(70);
    ctx.sunLight.intensity = isUp ? 3.1 : 0.02;
    ctx.hemi.intensity = isUp ? 1.3 : 0.55;

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
