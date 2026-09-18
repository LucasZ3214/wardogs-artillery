import { useEffect, useState } from 'react';

export type ContourOffset = { east: number; north: number };
const ZERO: ContourOffset = { east: 0, north: 0 };
// User-verified visual registration, not a change to terrain query coordinates.
export const DEFAULT_CONTOUR_OFFSET: ContourOffset = { east: 27, north: 27 };
const KEY = 'wardogs-contour-offsets-v1';
export function useContourOffset(mapId: string) {
  const [offsets, setOffsets] = useState<Record<string, ContourOffset>>({});
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      const clean: Record<string, ContourOffset> = {};
      for (const id of ['bakurani', 'ozeti', 'zestafona']) {
        const value = raw?.[id];
        if (value && Number.isFinite(value.east) && Number.isFinite(value.north)) {
          clean[id] = { east: Math.max(-500, Math.min(500, value.east)), north: Math.max(-500, Math.min(500, value.north)) };
        }
      }
      setOffsets(clean);
    } catch { /* Broken storage falls back to the visual registration default. */ }
  }, []);
  const update = (value: ContourOffset) => {
    if (!Number.isFinite(value.east) || !Number.isFinite(value.north)) return;
    const next = { ...offsets, [mapId]: { east: Math.max(-500, Math.min(500, value.east)), north: Math.max(-500, Math.min(500, value.north)) } };
    setOffsets(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Session remains usable. */ }
  };
  return [offsets[mapId] ?? DEFAULT_CONTOUR_OFFSET, update] as const;
}

export function ContourCalibration({ value, onChange }: { value: ContourOffset; onChange: (value: ContourOffset) => void }) {
  return <details className="contour-calibration"><summary>等高线平移校准</summary>
    <small>仅移动线层 · 正数向东/北，负数向西/南</small>
    {(['east', 'north'] as const).map(axis => <label key={axis}>{axis === 'east' ? '东西偏移（米）' : '南北偏移（米）'}
      <input type="number" inputMode="decimal" min={-500} max={500} step={1} value={value[axis]} onChange={e => { if (e.target.value !== '') onChange({ ...value, [axis]: e.target.valueAsNumber }); }} />
      <div className="contour-nudges"><button type="button" onClick={() => onChange({ ...value, [axis]: value[axis] - 1 })}>−1m</button><button type="button" onClick={() => onChange({ ...value, [axis]: value[axis] + 1 })}>+1m</button></div>
    </label>)}
    <button type="button" onClick={() => onChange(ZERO)}>当前地图归零</button>
    <button type="button" onClick={() => onChange(DEFAULT_CONTOUR_OFFSET)}>恢复默认 +27 / +27m</button>
  </details>;
}
