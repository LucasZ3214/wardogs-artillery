import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { CONTROL_ZONE_DIAMETER_METERS, CONTROL_ZONE_RADIUS_UNITS, MAX_RANGE_METERS, type ControlZone, type MapConfig, type MapMode, type MapStyle, type Point, type Target, type WeaponId } from './fire-control';

type Props = {
  map: MapConfig; mapStyle: MapStyle; gun: Point; weaponId: WeaponId; targets: Target[]; activeTargetId: string | null; mode: MapMode; resetKey: number; controlZone: ControlZone | null; czEdgeStart: Point | null;
  onMapClick: (point: Point) => void; onTargetSelect: (id: string) => void;
  onMarkerMove: (kind: 'gun' | 'target' | 'control-zone', id: string | null, point: Point) => void;
  onMarkerMoveEnd: (kind: 'gun' | 'target' | 'control-zone', id: string | null, point: Point) => void;
};
type Camera = { center: Point; scale: number; fitScale: number };
type PointerState = { startX: number; startY: number; x: number; y: number };
type DragMarker = { kind: 'gun' | 'target' | 'control-zone'; id: string | null } | null;
const TILE_WORLD_SIZE = 163.84;
const imageCache = new Map<string, HTMLImageElement>();

export function TacticalMap(props: Props) {
  const { map, gun, weaponId, targets, activeTargetId, mode, resetKey } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera>({ center: centerOf(map), scale: 8, fitScale: 8 });
  const pointersRef = useRef(new Map<number, PointerState>());
  const pinchRef = useRef<{ distance: number; midpoint: Point; scale: number; center: Point } | null>(null);
  const dragRef = useRef<DragMarker>(null);
  const movedRef = useRef(false);
  const propsRef = useRef(props);
  const invalidateRef = useRef<() => void>(() => undefined);

  const draw = useCallback(() => {
    const current = propsRef.current;
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth; const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    context.fillStyle = '#0e1719'; context.fillRect(0, 0, width, height);
    const camera = cameraRef.current;
    drawTiles(context, current.map, current.mapStyle, camera, width, height, () => invalidateRef.current());
    drawGrid(context, current.map, camera, width, height);
    if (current.controlZone) drawControlZone(context, current.controlZone, current.mapStyle, camera, width, height);
    if (current.czEdgeStart) drawControlZoneEdgePoint(context, worldToScreen(current.czEdgeStart, camera, width, height), '边点 1');
    const gunScreen = worldToScreen(current.gun, camera, width, height);
    drawRangeRing(context, gunScreen, MAX_RANGE_METERS[current.weaponId] / 100 * camera.scale, MAX_RANGE_METERS[current.weaponId], current.weaponId, current.mapStyle);

    const active = current.targets.find((target) => target.id === current.activeTargetId) ?? null;
    if (active) {
      const targetScreen = worldToScreen(active.point, camera, width, height);
      const aimScreen = worldToScreen(active.aimPoint, camera, width, height);
      context.save(); context.setLineDash([7, 7]); context.lineWidth = 1.5; context.strokeStyle = 'rgba(225,238,220,.55)';
      context.beginPath(); context.moveTo(gunScreen.x, gunScreen.y); context.lineTo(aimScreen.x, aimScreen.y); context.stroke(); context.setLineDash([]);
      if (active.impacts.length) {
        context.strokeStyle = '#f4b44b'; context.beginPath(); context.moveTo(targetScreen.x, targetScreen.y); context.lineTo(aimScreen.x, aimScreen.y); context.stroke();
        drawDiamond(context, aimScreen, 8, '#f4b44b', '修正');
        for (const impact of active.impacts) {
          const impactScreen = worldToScreen(impact.point, camera, width, height);
          context.strokeStyle = 'rgba(239,101,82,.6)'; context.beginPath(); context.moveTo(targetScreen.x, targetScreen.y); context.lineTo(impactScreen.x, impactScreen.y); context.stroke(); drawCross(context, impactScreen, '#ef6552');
        }
      }
      context.restore();
    }
    for (const landmark of current.map.markers) {
      if (camera.scale / camera.fitScale < (landmark.minZoom ?? 0)) continue;
      drawLandmark(context, worldToScreen(landmark, camera, width, height), landmark.label, landmark.icon);
    }
    for (const target of current.targets) drawTarget(context, worldToScreen(target.point, camera, width, height), target.id, target.id === current.activeTargetId, target.impacts.length, current.mapStyle);
    drawGun(context, gunScreen, current.mapStyle);
    context.fillStyle = 'rgba(7,13,15,.78)'; context.fillRect(14, height - 39, 174, 25);
    context.fillStyle = '#c9d5d1'; context.font = '600 12px ui-monospace, monospace';
    const modeName = current.mode === 'gun' ? '炮位' : current.mode === 'target' ? '目标' : current.mode === 'impact' ? '落点' : current.mode === 'control-zone' ? 'CZ中心' : 'CZ两点';
    context.fillText(`${modeName}模式 · ${Math.round(camera.scale / camera.fitScale * 100)}%`, 24, height - 22);
  }, []);

  useLayoutEffect(() => { propsRef.current = props; }, [props]);
  useEffect(() => { invalidateRef.current = draw; }, [draw]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const fit = () => {
      const width = canvas.clientWidth; const height = canvas.clientHeight;
      const fitScale = Math.min(width / (map.bounds.maxX - map.bounds.minX), height / (map.bounds.maxY - map.bounds.minY)) * .92;
      cameraRef.current = { center: centerOf(map), scale: fitScale, fitScale }; draw();
    };
    const observer = new ResizeObserver(() => {
      const old = cameraRef.current;
      const width = canvas.clientWidth; const height = canvas.clientHeight;
      const fitScale = Math.min(width / (map.bounds.maxX - map.bounds.minX), height / (map.bounds.maxY - map.bounds.minY)) * .92;
      const ratio = old.fitScale ? old.scale / old.fitScale : 1;
      cameraRef.current = { ...old, scale: fitScale * ratio, fitScale }; draw();
    });
    observer.observe(canvas); fit(); return () => observer.disconnect();
  }, [draw, map, resetKey]);
  useEffect(() => { draw(); }, [activeTargetId, draw, gun, map, mode, props.controlZone, props.czEdgeStart, props.mapStyle, targets, weaponId]);

  const hitMarker = (screen: Point): DragMarker => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const camera = cameraRef.current; const width = canvas.clientWidth; const height = canvas.clientHeight;
    if ((propsRef.current.mode === 'control-zone' || propsRef.current.mode === 'control-zone-edge') && propsRef.current.controlZone && distance(screen, worldToScreen(propsRef.current.controlZone.center, camera, width, height)) <= 30) return { kind: 'control-zone', id: null };
    if (propsRef.current.mode === 'control-zone' || propsRef.current.mode === 'control-zone-edge') return null;
    if (propsRef.current.mode !== 'impact' && distance(screen, worldToScreen(propsRef.current.gun, camera, width, height)) <= 30) return { kind: 'gun', id: null };
    for (const target of [...propsRef.current.targets].reverse()) {
      if (distance(screen, worldToScreen(target.point, camera, width, height)) > 30) continue;
      if (propsRef.current.mode === 'impact' && target.id === propsRef.current.activeTargetId) continue;
      return { kind: 'target', id: target.id };
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget; canvas.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY }); movedRef.current = false;
    if (pointersRef.current.size === 1) dragRef.current = hitMarker(localPoint(event, canvas));
    if (pointersRef.current.size === 2) {
      dragRef.current = null; const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale: cameraRef.current.scale, center: { ...cameraRef.current.center } };
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const existing = pointersRef.current.get(event.pointerId); if (!existing) return;
    const previous = { x: existing.x, y: existing.y }; existing.x = event.clientX; existing.y = event.clientY;
    if (Math.hypot(existing.x - existing.startX, existing.y - existing.startY) > 20) movedRef.current = true;
    const canvas = event.currentTarget; const pointers = [...pointersRef.current.values()];
    if (pointers.length === 2 && pinchRef.current) {
      const [a, b] = pointers; const nextDistance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)); const nextMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const rect = canvas.getBoundingClientRect();
      const originalCamera = { ...cameraRef.current, center: pinchRef.current.center, scale: pinchRef.current.scale };
      const beforeWorld = screenToWorld({ x: pinchRef.current.midpoint.x - rect.left, y: pinchRef.current.midpoint.y - rect.top }, originalCamera, canvas.clientWidth, canvas.clientHeight);
      const scale = clamp(pinchRef.current.scale * nextDistance / pinchRef.current.distance, cameraRef.current.fitScale * .8, cameraRef.current.fitScale * 128);
      const midLocal = { x: nextMid.x - rect.left, y: nextMid.y - rect.top };
      cameraRef.current = { ...cameraRef.current, scale, center: { x: beforeWorld.x - (midLocal.x - canvas.clientWidth / 2) / scale, y: beforeWorld.y + (midLocal.y - canvas.clientHeight / 2) / scale } }; draw(); return;
    }
    if (pointers.length !== 1) return;
    const local = localPoint(event, canvas);
    if (dragRef.current) propsRef.current.onMarkerMove(dragRef.current.kind, dragRef.current.id, clampToBounds(screenToWorld(local, cameraRef.current, canvas.clientWidth, canvas.clientHeight), propsRef.current.map));
    else { cameraRef.current.center.x -= (existing.x - previous.x) / cameraRef.current.scale; cameraRef.current.center.y += (existing.y - previous.y) / cameraRef.current.scale; draw(); }
  };
  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget; const existing = pointersRef.current.get(event.pointerId); const markerHit = dragRef.current;
    const world = clampToBounds(screenToWorld(localPoint(event, canvas), cameraRef.current, canvas.clientWidth, canvas.clientHeight), propsRef.current.map);
    pointersRef.current.delete(event.pointerId); if (pointersRef.current.size < 2) pinchRef.current = null;
    if (existing && !movedRef.current) {
      if (markerHit?.kind === 'target' && markerHit.id) propsRef.current.onTargetSelect(markerHit.id);
      else if (!markerHit) propsRef.current.onMapClick(world);
    } else if (markerHit) propsRef.current.onMarkerMoveEnd(markerHit.kind, markerHit.id, world);
    if (pointersRef.current.size === 0) dragRef.current = null;
  };
  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault(); const canvas = event.currentTarget; const point = localPoint(event, canvas);
    const before = screenToWorld(point, cameraRef.current, canvas.clientWidth, canvas.clientHeight);
    const scale = clamp(cameraRef.current.scale * Math.exp(-event.deltaY * .001), cameraRef.current.fitScale * .8, cameraRef.current.fitScale * 128);
    cameraRef.current.scale = scale; cameraRef.current.center = { x: before.x - (point.x - canvas.clientWidth / 2) / scale, y: before.y + (point.y - canvas.clientHeight / 2) / scale }; draw();
  };
  return <canvas ref={canvasRef} className="tactical-map" aria-label={`${map.name} 战术地图`} onContextMenu={(event) => event.preventDefault()} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} onWheel={onWheel} />;
}

function centerOf(map: MapConfig) { return { x: (map.bounds.minX + map.bounds.maxX) / 2, y: (map.bounds.minY + map.bounds.maxY) / 2 }; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function localPoint(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function worldToScreen(point: Point, camera: Camera, width: number, height: number) { return { x: (point.x - camera.center.x) * camera.scale + width / 2, y: (camera.center.y - point.y) * camera.scale + height / 2 }; }
function screenToWorld(point: Point, camera: Camera, width: number, height: number) { return { x: (point.x - width / 2) / camera.scale + camera.center.x, y: camera.center.y - (point.y - height / 2) / camera.scale }; }
function clampToBounds(point: Point, map: MapConfig) { return { x: clamp(point.x, map.bounds.minX, map.bounds.maxX), y: clamp(point.y, map.bounds.minY, map.bounds.maxY) }; }

function drawTiles(context: CanvasRenderingContext2D, map: MapConfig, mapStyle: MapStyle, camera: Camera, width: number, height: number, invalidate: () => void) {
  const zoom = clamp(Math.round(Math.log2(camera.scale / (256 / TILE_WORLD_SIZE))), 0, 7); const count = 2 ** zoom; const worldPerTile = TILE_WORLD_SIZE / count;
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera, width, height); const bottomRight = screenToWorld({ x: width, y: height }, camera, width, height);
  const minX = clamp(Math.floor((Math.min(topLeft.x, bottomRight.x) - map.tileBounds.minX) / worldPerTile), 0, count - 1); const maxX = clamp(Math.floor((Math.max(topLeft.x, bottomRight.x) - map.tileBounds.minX) / worldPerTile), 0, count - 1);
  const visibleMinY = Math.min(topLeft.y, bottomRight.y); const visibleMaxY = Math.max(topLeft.y, bottomRight.y);
  const minY = clamp(Math.floor((map.tileBounds.maxY - visibleMaxY) / worldPerTile), 0, count - 1); const maxY = clamp(Math.floor((map.tileBounds.maxY - visibleMinY) / worldPerTile), 0, count - 1);
  context.save(); context.filter = mapStyle === 'grayscale' ? 'brightness(1.45) contrast(1.12)' : 'none';
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const url = `${map.tiles[mapStyle]}/zoom_${zoom}/${x}_${y}.webp`; let image = imageCache.get(url);
    if (!image) { image = new Image(); image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.onload = invalidate; image.onerror = invalidate; image.src = url; imageCache.set(url, image); }
    if (!image.complete || !image.naturalWidth) continue;
    const screen = worldToScreen({ x: map.tileBounds.minX + x * worldPerTile, y: map.tileBounds.maxY - y * worldPerTile }, camera, width, height); const size = worldPerTile * camera.scale + 1;
    context.drawImage(image, screen.x, screen.y, size, size);
  }
  context.restore(); context.fillStyle = 'rgba(7,14,16,.06)'; context.fillRect(0, 0, width, height);
}
function drawGrid(context: CanvasRenderingContext2D, map: MapConfig, camera: Camera, width: number, height: number) {
  const step = camera.scale > 60 ? .5 : camera.scale > 30 ? 1 : camera.scale > 12 ? 2 : camera.scale > 5 ? 5 : 10; const startX = Math.ceil(map.bounds.minX / step) * step; const startY = Math.ceil(map.bounds.minY / step) * step;
  context.save(); context.lineWidth = 1; context.font = '11px ui-monospace, monospace';
  for (let x = startX; x <= map.bounds.maxX; x += step) { const a = worldToScreen({ x, y: map.bounds.minY }, camera, width, height); const b = worldToScreen({ x, y: map.bounds.maxY }, camera, width, height); context.strokeStyle = Math.abs(x / step) % 5 === 0 ? 'rgba(207,225,218,.25)' : 'rgba(207,225,218,.1)'; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); if (step >= 1) { context.fillStyle = 'rgba(224,235,231,.58)'; context.fillText(x.toFixed(0), a.x + 3, Math.max(105, a.y + 13)); } }
  for (let y = startY; y <= map.bounds.maxY; y += step) { const a = worldToScreen({ x: map.bounds.minX, y }, camera, width, height); const b = worldToScreen({ x: map.bounds.maxX, y }, camera, width, height); context.strokeStyle = Math.abs(y / step) % 5 === 0 ? 'rgba(207,225,218,.25)' : 'rgba(207,225,218,.1)'; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); if (step >= 1) { context.fillStyle = 'rgba(224,235,231,.58)'; context.fillText(y.toFixed(0), Math.max(4, a.x + 3), a.y - 3); } }
  context.restore();
}
function drawControlZone(context: CanvasRenderingContext2D, zone: ControlZone, mapStyle: MapStyle, camera: Camera, width: number, height: number) {
  const center = worldToScreen(zone.center, camera, width, height); const radius = CONTROL_ZONE_RADIUS_UNITS * camera.scale;
  if (zone.alternateCenter) { const alternate = worldToScreen(zone.alternateCenter, camera, width, height); context.save(); context.setLineDash([6, 8]); context.strokeStyle = 'rgba(255,85,117,.32)'; context.lineWidth = 1.25; context.beginPath(); context.arc(alternate.x, alternate.y, radius, 0, Math.PI * 2); context.stroke(); context.restore(); drawControlZoneEdgePoint(context, alternate, '备选'); }
  context.save(); context.fillStyle = 'rgba(255,85,117,.055)'; context.beginPath(); context.arc(center.x, center.y, radius, 0, Math.PI * 2); context.fill(); if (mapStyle === 'color') { context.strokeStyle = 'rgba(4,10,12,.9)'; context.lineWidth = 3; context.stroke(); } context.strokeStyle = '#ff5575'; context.lineWidth = 1.5; context.stroke(); context.restore();
  if (zone.edgePoints) { const a = worldToScreen(zone.edgePoints[0], camera, width, height); const b = worldToScreen(zone.edgePoints[1], camera, width, height); context.save(); context.setLineDash([5, 5]); context.strokeStyle = 'rgba(255,188,202,.75)'; context.lineWidth = 1; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.restore(); drawControlZoneEdgePoint(context, a, '1'); drawControlZoneEdgePoint(context, b, '2'); }
  drawReticle(context, center, '#ff5575', 12, 6, 1.5, true, mapStyle === 'color'); drawLabel(context, { x: center.x, y: center.y - radius - 8 }, `CZ Ø${CONTROL_ZONE_DIAMETER_METERS}m`, '#ff9aae');
}
function drawControlZoneEdgePoint(context: CanvasRenderingContext2D, point: Point, label: string) { context.save(); context.fillStyle = '#ff9aae'; context.strokeStyle = 'rgba(4,10,12,.9)'; context.lineWidth = 2; context.beginPath(); context.arc(point.x, point.y, 4, 0, Math.PI * 2); context.fill(); context.stroke(); context.restore(); drawLabel(context, { x: point.x, y: point.y - 12 }, label, '#ffb4c2'); }
function drawRangeRing(context: CanvasRenderingContext2D, point: Point, radius: number, meters: number, weaponId: WeaponId, mapStyle: MapStyle) {
  context.save(); context.fillStyle = 'rgba(95,215,255,.035)'; context.setLineDash([9, 7]);
  context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill();
  if (mapStyle === 'color') { context.strokeStyle = 'rgba(4,10,12,.92)'; context.lineWidth = 2.5; context.stroke(); }
  context.strokeStyle = 'rgba(95,215,255,.74)'; context.lineWidth = 1.5; context.stroke(); context.restore();
  drawLabel(context, { x: point.x, y: point.y - radius - 8 }, `${weaponId === 'mortar' ? 'L81' : 'SPH-2'} MAX ${meters}m`, '#8ce4ff');
}
function drawGun(context: CanvasRenderingContext2D, point: Point, mapStyle: MapStyle) { drawReticle(context, point, '#5fd7ff', 13, 8, 1.5, true, mapStyle === 'color'); drawLabel(context, { x: point.x, y: point.y + 24 }, '炮位', '#8ce4ff'); }
function drawTarget(context: CanvasRenderingContext2D, point: Point, label: string, active: boolean, impacts: number, mapStyle: MapStyle) { const reticleColor = active ? '#ffcb62' : '#e3ebe8'; drawReticle(context, point, reticleColor, active ? 14 : 13, 8, active ? 1.75 : 1.25, active, mapStyle === 'color'); drawLabel(context, { x: point.x, y: point.y - 24 }, impacts ? `${label} · ${impacts}` : label, active ? '#ffcb62' : '#e3ebe8'); }
function drawReticle(context: CanvasRenderingContext2D, point: Point, color: string, arm: number, gap: number, lineWidth: number, glow: boolean, outline = false) { context.save(); context.translate(point.x, point.y); context.lineCap = 'square'; context.beginPath(); context.moveTo(-arm, 0); context.lineTo(-gap, 0); context.moveTo(gap, 0); context.lineTo(arm, 0); context.moveTo(0, -arm); context.lineTo(0, -gap); context.moveTo(0, gap); context.lineTo(0, arm); if (outline) { context.strokeStyle = 'rgba(4,10,12,.95)'; context.lineWidth = lineWidth + 1.5; context.stroke(); } context.strokeStyle = color; context.lineWidth = lineWidth; if (glow) { context.shadowColor = color; context.shadowBlur = 5; } context.stroke(); context.shadowBlur = 0; if (outline) { context.fillStyle = 'rgba(4,10,12,.95)'; context.beginPath(); context.arc(0, 0, 2.5, 0, Math.PI * 2); context.fill(); } context.fillStyle = color; context.beginPath(); context.arc(0, 0, 1.75, 0, Math.PI * 2); context.fill(); context.restore(); }
function drawLandmark(context: CanvasRenderingContext2D, point: Point, label: string, icon: string) { const tower = icon === 'tower'; context.save(); context.fillStyle = tower ? '#f0b65a' : '#91b8ae'; context.strokeStyle = '#0a1113'; context.lineWidth = 3; context.beginPath(); context.arc(point.x, point.y, tower ? 7 : 5, 0, Math.PI * 2); context.fill(); context.stroke(); context.restore(); if (tower || ['valkyra','manticore','lonestar'].includes(icon)) drawLabel(context, { x: point.x, y: point.y - 14 }, label, tower ? '#f5cb80' : '#bbd5ce'); }
function drawLabel(context: CanvasRenderingContext2D, point: Point, text: string, color: string) { context.save(); context.font = '700 12px system-ui, sans-serif'; context.textAlign = 'center'; const labelWidth = context.measureText(text).width + 12; context.fillStyle = 'rgba(7,12,14,.8)'; context.fillRect(point.x - labelWidth / 2, point.y - 11, labelWidth, 18); context.fillStyle = color; context.fillText(text, point.x, point.y + 2); context.restore(); }
function drawCross(context: CanvasRenderingContext2D, point: Point, color: string) { context.save(); context.strokeStyle = color; context.lineWidth = 3; context.beginPath(); context.moveTo(point.x - 8, point.y - 8); context.lineTo(point.x + 8, point.y + 8); context.moveTo(point.x + 8, point.y - 8); context.lineTo(point.x - 8, point.y + 8); context.stroke(); context.restore(); }
function drawDiamond(context: CanvasRenderingContext2D, point: Point, radius: number, color: string, label: string) { context.save(); context.translate(point.x, point.y); context.rotate(Math.PI / 4); context.strokeStyle = color; context.lineWidth = 2; context.strokeRect(-radius, -radius, radius * 2, radius * 2); context.restore(); drawLabel(context, { x: point.x, y: point.y - 22 }, label, color); }
