/**
 * Procedural canvas textures for the planner scene.
 *
 * Everything is generated at runtime so the app ships no image assets, and both
 * textures wrap seamlessly so they can be tiled across surfaces whose UVs are in
 * world metres.
 */

import * as THREE from "three";

/**
 * A photovoltaic module: 6x12 cell matrix behind glass, with busbars and a
 * diagonal sheen. Mapped so `u` runs across the module width (along the eaves)
 * and `v` up the slope.
 */
export function makePanelTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 796;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Dark backsheet showing through the gaps between cells.
  ctx.fillStyle = "#0a1626";
  ctx.fillRect(0, 0, W, H);

  const cols = 6;
  const rows = 12;
  const padX = 15;
  const padY = 17;
  const gap = 3;
  const cw = (W - padX * 2 - gap * (cols - 1)) / cols;
  const ch = (H - padY * 2 - gap * (rows - 1)) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * (cw + gap);
      const y = padY + r * (ch + gap);

      // Monocrystalline cells read as deep blue with a corner-to-corner sheen.
      const cell = ctx.createLinearGradient(x, y, x + cw, y + ch);
      cell.addColorStop(0, "#1e5089");
      cell.addColorStop(0.45, "#123c6c");
      cell.addColorStop(1, "#0c2947");
      ctx.fillStyle = cell;
      ctx.fillRect(x, y, cw, ch);

      // Fingers: thin silver lines running along the cell.
      ctx.strokeStyle = "rgba(198,218,240,0.32)";
      ctx.lineWidth = 1.3;
      for (let b = 1; b <= 3; b++) {
        const bx = x + (cw * b) / 4;
        ctx.beginPath();
        ctx.moveTo(bx, y + 2);
        ctx.lineTo(bx, y + ch - 2);
        ctx.stroke();
      }

      // Busbar across the middle of the cell.
      ctx.strokeStyle = "rgba(214,230,246,0.5)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y + ch / 2);
      ctx.lineTo(x + cw, y + ch / 2);
      ctx.stroke();
    }
  }

  // Glass sheen across the whole module.
  const sheen = ctx.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, "rgba(255,255,255,0.17)");
  sheen.addColorStop(0.36, "rgba(255,255,255,0.03)");
  sheen.addColorStop(0.6, "rgba(255,255,255,0.11)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Reused across scene rebuilds, so scene cleanup must not free it.
  texture.userData.shared = true;
  return texture;
}

/**
 * Rendered wall finish: a fine grain with soft blotching, so the facade is not
 * a single flat fill. Wraps in both directions.
 */
export function makeWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#efece4";
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 220; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 8 + Math.random() * 34;
    ctx.fillStyle = `rgba(${210 + Math.random() * 40}, ${208 + Math.random() * 40}, ${198 + Math.random() * 40}, 0.14)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    ctx.fillStyle =
      v > 0.5
        ? `rgba(255,255,255,${0.05 + Math.random() * 0.08})`
        : `rgba(120,112,100,${0.02 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Wall UVs are in metres; one tile per two metres keeps the grain fine.
  texture.repeat.set(0.5, 0.5);
  texture.userData.shared = true;
  return texture;
}

/**
 * Soft occlusion under a building footprint.
 *
 * Painted once and laid flat on the ground. Without it the walls meet the lawn
 * at a hard line with no darkening in the crease, so the house reads as a model
 * sitting on a plane rather than a building standing in a garden.
 */
export function makeContactShadowTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  const gradient = ctx.createRadialGradient(
    S / 2, S / 2, S * 0.18,
    S / 2, S / 2, S * 0.5,
  );
  gradient.addColorStop(0, "rgba(26, 32, 22, 0.44)");
  gradient.addColorStop(0.42, "rgba(26, 32, 22, 0.23)");
  gradient.addColorStop(1, "rgba(26, 32, 22, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, S, S);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.shared = true;
  return texture;
}

/**
 * Asphalt shingle courses. Four courses of four tabs, offset every other course
 * by half a tab so it tiles seamlessly in both directions.
 */
export function makeShingleTexture(): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#4c473f";
  ctx.fillRect(0, 0, S, S);

  const courses = 4;
  const tabW = 128;
  const rowH = S / courses;
  const palette = [
    "#6d665c",
    "#756e64",
    "#615a51",
    "#7a726a",
    "#676056",
    "#70685e",
    "#5c564d",
    "#736b61",
  ];

  for (let r = 0; r < courses; r++) {
    const y = r * rowH;
    const offset = r % 2 === 0 ? 0 : tabW / 2;
    for (let t = -1; t <= S / tabW; t++) {
      const x = t * tabW + offset;
      ctx.fillStyle = palette[Math.abs(r * 3 + t * 5) % palette.length];
      ctx.fillRect(x, y, tabW - 2, rowH - 2);

      // Shadow cast by the course above, and a lit lip at the bottom edge.
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.fillRect(x, y, tabW - 2, 7);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y + rowH - 11, tabW - 2, 4);
    }
  }

  // Granular mineral speckle.
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const v = Math.random();
    ctx.fillStyle =
      v > 0.55
        ? `rgba(255,255,255,${0.03 + Math.random() * 0.05})`
        : `rgba(0,0,0,${0.03 + Math.random() * 0.07})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Roof UVs are in metres, so one tile per metre.
  texture.repeat.set(1, 1);
  texture.userData.shared = true;
  return texture;
}
