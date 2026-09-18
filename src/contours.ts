import type { Point } from './fire-control';

type Manifest = { tiles: Record<string, { file: string; bounds: number[] }> };
type Lines = [number, [number, number][]][];
type Camera = { center: Point; scale: number };
const manifests = new Map<string, Manifest>();
const cache = new Map<string, Lines>();
const pending = new Set<string>();
const failures = new Map<string, number>();
const base = `${import.meta.env.BASE_URL}contours/`;
let active = 0;
export function contourInterval(scale: number): number {
  const zoom = Math.round(Math.log2(scale / (256 / 163.84)));
  return zoom >= 6 ? 2 : zoom >= 5 ? 5 : 10;
}
function request<T>(url: string, compressed: boolean, done: (data: T) => void, redraw: () => void) {
  if (active >= 4 || pending.has(url) || (failures.get(url) ?? 0) > Date.now()) return;
  pending.add(url); active++;
  fetch(url).then(async response => {
    if (!response.ok) throw new Error(`Contours ${response.status}`);
    if (!compressed) return response.json();
    if (!response.body) throw new Error('No contour body');
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  }).then(done).catch(() => { failures.set(url, Date.now() + 60000); })
    .finally(() => { pending.delete(url); active--; redraw(); });
}

export function drawContours(ctx: CanvasRenderingContext2D, mapId: string, color: boolean, camera: Camera, width: number, height: number, redraw: () => void) {
  if (typeof DecompressionStream === 'undefined') return;
  const manifest = manifests.get(mapId);
  if (!manifest) {
    request<Manifest>(`${base}${mapId}/manifest.json`, false, data => manifests.set(mapId, data), redraw);
    return;
  }
  const interval = contourInterval(camera.scale);
  const left = camera.center.x - width / (2 * camera.scale), right = camera.center.x + width / (2 * camera.scale);
  const bottom = camera.center.y - height / (2 * camera.scale), top = camera.center.y + height / (2 * camera.scale);
  const paths = [new Path2D(), new Path2D()];
  for (const entry of Object.values(manifest.tiles)) {
    const [x0,y0,x1,y1] = entry.bounds;
    if (x1 < left || x0 > right || y1 < bottom || y0 > top) continue;
    const url = `${base}${mapId}/${interval}/${entry.file}`;
    const lines = cache.get(url);
    if (!lines) {
      request<Lines>(url, true, data => {
        cache.set(url, data);
        // Must hold an entire low-zoom map (up to 121 blocks), otherwise visible
        // blocks evict each other and cause an endless fetch/redraw cycle.
        while (cache.size > 160) cache.delete(cache.keys().next().value!);
      }, redraw);
      continue;
    }
    cache.delete(url); cache.set(url, lines);
    for (const [elevation, points] of lines) {
      const path = paths[elevation % 50 === 0 ? 1 : 0];
      points.forEach(([x,y], index) => {
        const sx = (x-camera.center.x)*camera.scale+width/2;
        const sy = (camera.center.y-y)*camera.scale+height/2;
        if (index === 0) path.moveTo(sx,sy); else path.lineTo(sx,sy);
      });
    }
  }
  ctx.save(); ctx.setLineDash([]); ctx.lineJoin = 'round';
  paths.forEach((path, major) => {
    const width = major ? 1.25 : .65;
    if (color) {
      ctx.lineWidth = width+.65; ctx.strokeStyle = major ? 'rgba(244,237,220,.69)' : 'rgba(244,237,220,.49)'; ctx.stroke(path);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = color ? (major ? 'rgba(68,42,83,.96)' : 'rgba(68,42,83,.76)') : (major ? 'rgba(255,211,130,.94)' : 'rgba(255,211,130,.59)');
    ctx.stroke(path);
  });
  ctx.restore();
}
