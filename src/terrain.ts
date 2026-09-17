import { MAPS, type Point, type TerrainInfo } from './fire-control';

export type TerrainChunk = { file: string; column: number; row: number; width: number; height: number; sha256: string };
export type TerrainManifest = {
  format: 'wardogs-combat-terrain-i16-dm-v1';
  mapId: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  originX: number;
  originY: number;
  spacingGameUnits: number;
  chunkCells: number;
  columns: number;
  rows: number;
  chunks: Record<string, TerrainChunk>;
};

const manifestCache = new Map<string, Promise<TerrainManifest>>();
const chunkCache = new Map<string, Promise<Int16Array>>();

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

async function fetchManifest(mapId: string) {
  let request = manifestCache.get(mapId);
  if (!request) {
    request = fetch(asset(`terrain/${mapId}/manifest.json`), { cache: 'force-cache' }).then((response) => {
      if (!response.ok) throw new Error(`terrain manifest ${response.status}`);
      return response.json() as Promise<TerrainManifest>;
    });
    manifestCache.set(mapId, request);
  }
  return request;
}

async function fetchChunk(mapId: string, entry: TerrainChunk) {
  const key = `${mapId}/${entry.file}`;
  let request = chunkCache.get(key);
  if (!request) {
    request = fetch(asset(`terrain/${mapId}/${entry.file}`), { cache: 'force-cache' }).then(async (response) => {
      if (!response.ok) throw new Error(`terrain chunk ${response.status}`);
      return new Int16Array(await response.arrayBuffer());
    });
    chunkCache.set(key, request);
  }
  return request;
}

export function sampleChunk(data: Int16Array, width: number, height: number, x: number, y: number) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0; const fy = y - y0;
  const at = (px: number, py: number) => data[py * width + px] / 10;
  const a = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const b = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return a + (b - a) * fy;
}

async function height(mapId: string, point: Point) {
  const combat = MAPS[mapId]?.bounds;
  if (!combat || point.x < combat.minX || point.x > combat.maxX || point.y < combat.minY || point.y > combat.maxY) return null;
  const manifest = await fetchManifest(mapId);
  const gridX = (point.x - manifest.originX) / manifest.spacingGameUnits;
  const gridY = (point.y - manifest.originY) / manifest.spacingGameUnits;
  if (gridX < 0 || gridY < 0 || gridX > manifest.columns - 1 || gridY > manifest.rows - 1) return null;
  const chunkColumn = Math.min(Math.floor((manifest.columns - 2) / manifest.chunkCells), Math.floor(gridX / manifest.chunkCells));
  const chunkRow = Math.min(Math.floor((manifest.rows - 2) / manifest.chunkCells), Math.floor(gridY / manifest.chunkCells));
  const entry = manifest.chunks[`${chunkColumn},${chunkRow}`];
  if (!entry) return null;
  const data = await fetchChunk(mapId, entry);
  if (data.length !== entry.width * entry.height) throw new Error('invalid terrain chunk length');
  return sampleChunk(data, entry.width, entry.height, gridX - entry.column * manifest.chunkCells, gridY - entry.row * manifest.chunkCells);
}

export async function sampleTerrainPair(mapId: string, gun: Point, target: Point): Promise<TerrainInfo> {
  try {
    const [gunElevation, targetElevation] = await Promise.all([height(mapId, gun), height(mapId, target)]);
    if (gunElevation == null || targetElevation == null) throw new Error('outside combat terrain');
    return { gunElevation, targetElevation, deltaZ: targetElevation - gunElevation, status: 'ready' };
  } catch {
    return { gunElevation: null, targetElevation: null, deltaZ: null, status: 'unavailable' };
  }
}
