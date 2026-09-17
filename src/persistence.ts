import type { FireControlState, Point, Target } from './fire-control';

export const STORAGE_KEY = 'wardogs-static-state-v1';
export type PortableDocument = { schema: 1; settings: { mapId: string; weaponId: string; arc: string; gun: Point; activeTargetId: string | null }; targets: Target[] };

const finitePoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Point;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

export function validateState(value: unknown): FireControlState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as FireControlState;
  if (!['bakurani', 'ozeti', 'zestafona'].includes(state.mapId)) return null;
  if (!['mortar', 'spg'].includes(state.weaponId) || !['single', 'low', 'high'].includes(state.arc)) return null;
  if (!finitePoint(state.gun) || !Array.isArray(state.targets)) return null;
  if (!state.targets.every((target) => target && typeof target.id === 'string' && finitePoint(target.point) && finitePoint(target.aimPoint) && Array.isArray(target.impacts))) return null;
  return { ...state, terrain: { gunElevation: null, targetElevation: null, deltaZ: null, status: 'pending' } };
}

export function loadState(fallback: FireControlState): FireControlState {
  try { return validateState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')) ?? fallback; }
  catch { return fallback; }
}

export function saveState(state: FireControlState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode/quota */ }
}

export function exportDocument(state: FireControlState): PortableDocument {
  return { schema: 1, settings: { mapId: state.mapId, weaponId: state.weaponId, arc: state.arc, gun: state.gun, activeTargetId: state.activeTargetId }, targets: state.targets };
}

export function importDocument(value: unknown, fallback: FireControlState): FireControlState | null {
  if (!value || typeof value !== 'object') return null;
  const document = value as Partial<PortableDocument>;
  if (document.schema !== 1 || !document.settings || !Array.isArray(document.targets)) return null;
  return validateState({ ...fallback, ...document.settings, targets: document.targets });
}
