/*
 * Filler city: generic low-rise blocks past the real neighbours, so the ground out to the horizon reads as town, not
 * desert. Nothing here is real. The real neighbours (OSM, within 220 m) stay as they are; the filler starts at that
 * circle, steps around any real geometry reaching past it, and thins out a little toward FILLER_OUTER_M, where the
 * haze has mostly swallowed it.
 *
 * Deterministic: one fixed seed (FILLER_SEED), so a model looks the same on every visit and in every view.
 * Mirrored in building-viewer/scaffold.html (fillerBlocks); keep the two in step.
 */

/** Block pitch: one block plus its street, metres. */
export const FILLER_CELL_M = 64;
/** Street width between blocks. */
export const FILLER_STREET_M = 14;
/**
 * Past this, no filler. Far enough that any view of the model (zoom-out is capped at about three framings) sees town
 * until the camera's haze (house-look HOUSE_HAZE, all sky by 8 km) has taken over, never bare ground.
 */
export const FILLER_OUTER_M = 5000;
/** Gap kept between the farthest real neighbour and the first filler block. */
export const FILLER_GAP_M = 20;

export type FillerBlock = { x: number; z: number; w: number; d: number; h: number };

/** mulberry32: a small, fast, seeded PRNG. Same seed, same sequence. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One town for every model and every view: the Model tab (the standalone viewer page) and the shots and proposal
 * (ModelViewer) must show the same filler around the same building, and neither knows the other's model key.
 */
export const FILLER_SEED = 0x7a3c91d5;

/**
 * No filler inside this circle: the real map context (building-viewer geo.ts CONTEXT_RADIUS_M, 220 m) plus the gap.
 * Empty lots between real neighbours stay empty; fake buildings never stand beside the real one or in its shots.
 */
export const FILLER_CLEAR_M = 220 + FILLER_GAP_M;

/** Footprint grid resolution, metres. */
export const FOOTPRINT_CELL_M = 8;

/**
 * Where the real model stands on the ground: a grid of FOOTPRINT_CELL_M cells, set where any of its triangles (seen
 * from above) covers the cell's centre. Walls are edge-on from above and cover nothing; roofs, caps and streets do.
 */
export type Footprint = { x0: number; z0: number; cols: number; rows: number; filled: Uint8Array };

/** A triangle seen from above: x0, z0, x1, z1, x2, z2. */
export type GroundTriangle = [number, number, number, number, number, number];

export function footprintOf(triangles: GroundTriangle[]): Footprint | null {
  if (triangles.length === 0) return null;
  const C = FOOTPRINT_CELL_M;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const t of triangles) {
    minX = Math.min(minX, t[0], t[2], t[4]);
    maxX = Math.max(maxX, t[0], t[2], t[4]);
    minZ = Math.min(minZ, t[1], t[3], t[5]);
    maxZ = Math.max(maxZ, t[1], t[3], t[5]);
  }
  const x0 = Math.floor(minX / C) * C;
  const z0 = Math.floor(minZ / C) * C;
  const cols = Math.max(1, Math.ceil((maxX - x0) / C) + 1);
  const rows = Math.max(1, Math.ceil((maxZ - z0) / C) + 1);
  const filled = new Uint8Array(cols * rows);
  for (const [ax, az, bx, bz, cx, cz] of triangles) {
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-6) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / C));
    const i1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx, cx) - x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / C));
    const j1 = Math.min(rows - 1, Math.floor((Math.max(az, bz, cz) - z0) / C));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const px = x0 + (i + 0.5) * C;
        const pz = z0 + (j + 0.5) * C;
        const w0 = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area;
        const w1 = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area;
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) filled[j * cols + i] = 1;
      }
    }
  }
  return { x0, z0, cols, rows, filled };
}

/** True when the rectangle, grown by FILLER_GAP_M on every side, touches no filled footprint cell. */
function clearOf(fp: Footprint | null, x: number, z: number, w: number, d: number): boolean {
  if (!fp) return true;
  const C = FOOTPRINT_CELL_M;
  const i0 = Math.max(0, Math.floor((x - w / 2 - FILLER_GAP_M - fp.x0) / C));
  const i1 = Math.min(fp.cols - 1, Math.floor((x + w / 2 + FILLER_GAP_M - fp.x0) / C));
  const j0 = Math.max(0, Math.floor((z - d / 2 - FILLER_GAP_M - fp.z0) / C));
  const j1 = Math.min(fp.rows - 1, Math.floor((z + d / 2 + FILLER_GAP_M - fp.z0) / C));
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) if (fp.filled[j * fp.cols + i]) return false;
  }
  return true;
}

/**
 * The filler blocks: boxes standing on the ground (y from 0 to h), centred at (x, z), on an axis-aligned street grid.
 * None stands inside FILLER_CLEAR_M (the real map context's circle) or within FILLER_GAP_M of the real model's
 * footprint where that pokes out past it (a long street, a big neighbour on the edge), and none sits past
 * FILLER_OUTER_M. So the town runs right up to the real context, with no empty ring around it. Each block of the
 * grid holds one, two or four lots; most buildings are 2 to 6 storeys, a few are taller.
 */
export function fillerBlocks(footprint: Footprint | null, seed: number): FillerBlock[] {
  const rand = random(seed);
  const block = FILLER_CELL_M - FILLER_STREET_M;
  const blocks: FillerBlock[] = [];
  const reach = Math.ceil(FILLER_OUTER_M / FILLER_CELL_M);
  for (let i = -reach; i < reach; i++) {
    for (let j = -reach; j < reach; j++) {
      // Draw every random number for every cell, kept or not, so one cell's outcome never shifts another's.
      const keep = rand();
      const split = rand();
      const x0 = i * FILLER_CELL_M + FILLER_STREET_M / 2;
      const z0 = j * FILLER_CELL_M + FILLER_STREET_M / 2;
      const lots = split < 0.35 ? 1 : split < 0.7 ? 2 : 4;
      const cols = lots === 4 ? 2 : lots === 2 && split < 0.525 ? 2 : 1;
      const rows = lots / cols;
      const lotW = block / cols;
      const lotD = block / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const fill = 0.55 + rand() * 0.35;
          const fillD = 0.55 + rand() * 0.35;
          const jx = rand();
          const jz = rand();
          const tall = rand();
          const storeys = rand();
          const w = lotW * fill;
          const d = lotD * fillD;
          const x = x0 + c * lotW + (lotW - w) * jx + w / 2;
          const z = z0 + r * lotD + (lotD - d) * jz + d / 2;
          const far = Math.hypot(x, z);
          const near = Math.hypot(Math.max(Math.abs(x) - w / 2, 0), Math.max(Math.abs(z) - d / 2, 0));
          if (near < FILLER_CLEAR_M || far > FILLER_OUTER_M) continue;
          // A little sparser toward the edge of town, never thin enough to read as empty ground.
          if (keep < 0.15 + 0.2 * (far / FILLER_OUTER_M)) continue;
          if (!clearOf(footprint, x, z, w, d)) continue;
          const h = tall < 0.05 ? 28 + storeys * 32 : 7 + storeys * storeys * 16;
          blocks.push({ x, z, w, d, h });
        }
      }
    }
  }
  return blocks;
}
