import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SOURCE_ROOT = 'https://assets.wardogs-artillery.com/releases/assets-v1/data/terrain';
const SPACING = 0.04; // 4 meters in map coordinates
const CHUNK_CELLS = 256;
const VERIFY = process.argv.includes('--verify');
const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'public', 'terrain');
const CACHE = path.join(ROOT, '.terrain-source-cache');
const BOUNDS = {
  bakurani: { minX: 23.35, maxX: 133.6, minY: 19.34, maxY: 129.65 },
  ozeti: { minX: 57.58, maxX: 143.07, minY: 21.81, maxY: 99.56 },
  zestafona: { minX: 19.9, maxX: 124.89, minY: 50.7, maxY: 141.9 },
};

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

async function fetchBytes(url, destination, expected = null, digest = null) {
  if (existsSync(destination)) {
    const cached = await readFile(destination);
    if ((!expected || cached.length === expected) && (!digest || sha256(cached) === digest)) return cached;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'wardogs-artillery-pages-builder/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (expected && bytes.length !== expected) throw new Error(`length ${bytes.length} != ${expected}`);
      if (digest && sha256(bytes) !== digest) throw new Error('SHA-256 mismatch');
      await writeFile(destination, bytes); return bytes;
    } catch (error) { last = error; await new Promise((resolve) => setTimeout(resolve, attempt * 800)); }
  }
  throw new Error(`Failed ${url}: ${last}`);
}

async function loadSource(mapId, bounds) {
  const manifestPath = path.join(CACHE, mapId, 'manifest.json');
  const manifestBytes = await fetchBytes(`${SOURCE_ROOT}/${mapId}/manifest.json`, manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const pad = SPACING;
  const xs = [bounds.minX - pad, bounds.maxX + pad]; const ys = [bounds.minY - pad, bounds.maxY + pad];
  const qx = xs.map((x) => manifest.globalQuadOffsetX + x * (manifest.gameUnitsToLandscapeQuadsX ?? manifest.gameUnitsToLandscapeQuads));
  const qy = ys.map((y) => manifest.globalQuadOffsetY + y * (manifest.gameUnitsToLandscapeQuadsY ?? manifest.gameUnitsToLandscapeQuads));
  const cx0 = Math.max(manifest.chunkXMin, Math.floor(Math.min(...qx) / manifest.chunkQuads));
  const cx1 = Math.min(manifest.chunkXMax, Math.floor(Math.max(...qx) / manifest.chunkQuads));
  const cy0 = Math.max(manifest.chunkYMin, Math.floor(Math.min(...qy) / manifest.chunkQuads));
  const cy1 = Math.min(manifest.chunkYMax, Math.floor(Math.max(...qy) / manifest.chunkQuads));
  const required = [];
  for (let cy = cy0; cy <= cy1; cy += 1) for (let cx = cx0; cx <= cx1; cx += 1) required.push(`${cx},${cy}`);
  const chunks = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < required.length) {
      const key = required[cursor++]; const entry = manifest.chunks[key];
      if (!entry) throw new Error(`${mapId}: missing source chunk ${key}`);
      const bytes = await fetchBytes(`${SOURCE_ROOT}/${mapId}/${entry.file}`, path.join(CACHE, mapId, entry.file), entry.bytes, entry.sha256);
      chunks.set(key, new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
      process.stdout.write(`\r${mapId}: source ${chunks.size}/${required.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, required.length) }, worker)); process.stdout.write('\n');
  return { manifest, chunks };
}

function sourceHeight(source, point) {
  const m = source.manifest;
  const qx = m.globalQuadOffsetX + point.x * (m.gameUnitsToLandscapeQuadsX ?? m.gameUnitsToLandscapeQuads);
  const qy = m.globalQuadOffsetY + point.y * (m.gameUnitsToLandscapeQuadsY ?? m.gameUnitsToLandscapeQuads);
  const cx = Math.min(m.chunkXMax, Math.max(m.chunkXMin, Math.floor(qx / m.chunkQuads)));
  const cy = Math.min(m.chunkYMax, Math.max(m.chunkYMin, Math.floor(qy / m.chunkQuads)));
  const key = `${cx},${cy}`; const entry = m.chunks[key]; const data = source.chunks.get(key);
  if (!entry || !data) throw new Error(`source point outside loaded chunks: ${key}`);
  const lx = Math.min(m.chunkQuads, Math.max(0, qx - cx * m.chunkQuads));
  const ly = Math.min(m.chunkQuads, Math.max(0, qy - cy * m.chunkQuads));
  const x0 = Math.floor(lx); const y0 = Math.floor(ly); const x1 = Math.min(m.verticesPerSide - 1, x0 + 1); const y1 = Math.min(m.verticesPerSide - 1, y0 + 1);
  const decode = (raw) => m.worldZOffsetMeters + (entry.minLocalZ + raw / 65535 * (entry.maxLocalZ - entry.minLocalZ)) * m.worldZScaleMetersPerLocalUnit;
  const at = (x, y) => decode(data[y * m.verticesPerSide + x]);
  const fx = lx - x0; const fy = ly - y0;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

function derivedHeight(derived, point) {
  const gx = (point.x - derived.manifest.originX) / SPACING; const gy = (point.y - derived.manifest.originY) / SPACING;
  const column = Math.min(Math.floor((derived.manifest.columns - 2) / CHUNK_CELLS), Math.floor(gx / CHUNK_CELLS));
  const row = Math.min(Math.floor((derived.manifest.rows - 2) / CHUNK_CELLS), Math.floor(gy / CHUNK_CELLS));
  const entry = derived.manifest.chunks[`${column},${row}`]; const data = derived.arrays.get(`${column},${row}`);
  const x = gx - column * CHUNK_CELLS; const y = gy - row * CHUNK_CELLS;
  const x0 = Math.floor(x); const y0 = Math.floor(y); const x1 = Math.min(entry.width - 1, x0 + 1); const y1 = Math.min(entry.height - 1, y0 + 1);
  const at = (px, py) => data[py * entry.width + px] / 10;
  const fx = x - x0; const fy = y - y0;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

async function buildMap(mapId, bounds) {
  const source = await loadSource(mapId, bounds);
  const originX = Math.floor((bounds.minX - SPACING) / SPACING) * SPACING;
  const originY = Math.floor((bounds.minY - SPACING) / SPACING) * SPACING;
  const endX = Math.ceil((bounds.maxX + SPACING) / SPACING) * SPACING;
  const endY = Math.ceil((bounds.maxY + SPACING) / SPACING) * SPACING;
  const columns = Math.round((endX - originX) / SPACING) + 1; const rows = Math.round((endY - originY) / SPACING) + 1;
  const chunkColumns = Math.ceil((columns - 1) / CHUNK_CELLS); const chunkRows = Math.ceil((rows - 1) / CHUNK_CELLS);
  const manifest = { format: 'wardogs-combat-terrain-i16-dm-v1', mapId, source: `${SOURCE_ROOT}/${mapId}/manifest.json`, sourceFormat: source.manifest.format, bounds, originX, originY, spacingGameUnits: SPACING, spacingMeters: 4, quantizationMeters: .1, chunkCells: CHUNK_CELLS, columns, rows, chunks: {} };
  const arrays = new Map(); const outputDir = path.join(OUTPUT, mapId, 'chunks'); await mkdir(outputDir, { recursive: true });
  for (let row = 0; row < chunkRows; row += 1) for (let column = 0; column < chunkColumns; column += 1) {
    const width = Math.min(CHUNK_CELLS + 1, columns - column * CHUNK_CELLS); const height = Math.min(CHUNK_CELLS + 1, rows - row * CHUNK_CELLS);
    const values = new Int16Array(width * height);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const point = { x: originX + (column * CHUNK_CELLS + x) * SPACING, y: originY + (row * CHUNK_CELLS + y) * SPACING };
      values[y * width + x] = Math.max(-32768, Math.min(32767, Math.round(sourceHeight(source, point) * 10)));
    }
    const key = `${column},${row}`; const file = `chunks/${column}_${row}.bin`; const bytes = Buffer.from(values.buffer);
    await writeFile(path.join(OUTPUT, mapId, file), bytes); arrays.set(key, values);
    manifest.chunks[key] = { file, column, row, width, height, bytes: bytes.length, sha256: sha256(bytes) };
    process.stdout.write(`\r${mapId}: derived ${arrays.size}/${chunkColumns * chunkRows}`);
  }
  process.stdout.write('\n');
  await mkdir(path.join(OUTPUT, mapId), { recursive: true }); await writeFile(path.join(OUTPUT, mapId, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const derived = { manifest, arrays };
  if (VERIFY) verifyMap(mapId, bounds, source, derived);
  return derived;
}

function verifyMap(mapId, bounds, source, derived) {
  const random = seeded([...mapId].reduce((sum, char) => sum + char.charCodeAt(0), 0)); const errors = []; const pairErrors = [];
  for (let i = 0; i < 4000; i += 1) {
    const point = { x: bounds.minX + random() * (bounds.maxX - bounds.minX), y: bounds.minY + random() * (bounds.maxY - bounds.minY) };
    errors.push(Math.abs(sourceHeight(source, point) - derivedHeight(derived, point)));
  }
  for (let i = 0; i < 2000; i += 1) {
    const a = { x: bounds.minX + random() * (bounds.maxX - bounds.minX), y: bounds.minY + random() * (bounds.maxY - bounds.minY) };
    const b = { x: bounds.minX + random() * (bounds.maxX - bounds.minX), y: bounds.minY + random() * (bounds.maxY - bounds.minY) };
    pairErrors.push(Math.abs((sourceHeight(source, b) - sourceHeight(source, a)) - (derivedHeight(derived, b) - derivedHeight(derived, a))));
  }
  for (const [key, entry] of Object.entries(derived.manifest.chunks)) {
    const [column, row] = key.split(',').map(Number); const current = derived.arrays.get(key);
    const right = derived.arrays.get(`${column + 1},${row}`); if (right) for (let y = 0; y < Math.min(entry.height, derived.manifest.chunks[`${column + 1},${row}`].height); y += 1) if (current[y * entry.width + entry.width - 1] !== right[y * derived.manifest.chunks[`${column + 1},${row}`].width]) throw new Error(`${mapId}: X seam ${key}`);
    const above = derived.arrays.get(`${column},${row + 1}`); if (above) for (let x = 0; x < Math.min(entry.width, derived.manifest.chunks[`${column},${row + 1}`].width); x += 1) if (current[(entry.height - 1) * entry.width + x] !== above[x]) throw new Error(`${mapId}: Y seam ${key}`);
  }
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length; const p95 = percentile(errors, .95); const pairP95 = percentile(pairErrors, .95);
  console.log(`${mapId}: mean=${mean.toFixed(3)}m p95=${p95.toFixed(3)}m delta-p95=${pairP95.toFixed(3)}m`);
  if (mean >= .1 || p95 >= .5 || pairP95 >= .75) throw new Error(`${mapId}: terrain verification threshold exceeded`);
}

await mkdir(OUTPUT, { recursive: true });
for (const [mapId, bounds] of Object.entries(BOUNDS)) await buildMap(mapId, bounds);
console.log(`Terrain assets ready: ${OUTPUT}`);
