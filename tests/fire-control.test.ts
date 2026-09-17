import { describe, expect, it } from 'vitest';
import { applyImpact, calculateSolution, correctionRadius, resetCorrections, type Target } from '../src/fire-control';
import { exportDocument, importDocument } from '../src/persistence';
import { sampleChunk } from '../src/terrain';

const target: Target = { id: 'T01', name: '测试', mapId: 'bakurani', point: { x: 10, y: 10 }, aimPoint: { x: 10, y: 10 }, weaponId: 'mortar', arc: 'single', impacts: [], createdAt: '', lastUsedAt: '' };

describe('fire control', () => {
  it('wraps bearing across north', () => {
    expect(calculateSolution({ x: 0, y: 0 }, { x: -.001, y: 1 }, 'mortar', 'single').bearing).toBeGreaterThan(359);
    expect(calculateSolution({ x: 0, y: 0 }, { x: 0, y: 1 }, 'mortar', 'single').bearing).toBe(0);
  });
  it('supports mortar and SPH-2 arc limits', () => {
    expect(calculateSolution({ x: 0, y: 0 }, { x: 0, y: 6.97 }, 'mortar', 'single').valid).toBe(true);
    expect(calculateSolution({ x: 0, y: 0 }, { x: 0, y: 7.1 }, 'mortar', 'single').valid).toBe(false);
    expect(calculateSolution({ x: 0, y: 0 }, { x: 0, y: 20 }, 'spg', 'low').valid).toBe(true);
    expect(calculateSolution({ x: 0, y: 0 }, { x: 0, y: 20 }, 'spg', 'high').valid).toBe(true);
  });
  it('uses adaptive terminal correction radii', () => {
    expect(correctionRadius('mortar', 100)).toBe(30);
    expect(correctionRadius('mortar', 600)).toBe(60);
    expect(correctionRadius('spg', 3000)).toBe(250);
  });
  it('iterates virtual aim points and resets after gun movement', () => {
    const once = applyImpact(target, { x: 10.1, y: 9.8 });
    expect(once.aimPoint.x).toBeCloseTo(9.9);
    expect(once.aimPoint.y).toBeCloseTo(10.2);
    const twice = applyImpact(once, { x: 10.05, y: 10.1 });
    expect(twice.aimPoint.x).toBeCloseTo(9.85);
    expect(twice.aimPoint.y).toBeCloseTo(10.1);
    expect(resetCorrections([twice])[0]).toMatchObject({ aimPoint: target.point, impacts: [] });
  });
});

describe('portable history', () => {
  const state = { mapId: 'bakurani', weaponId: 'mortar' as const, arc: 'single' as const, gun: { x: 1, y: 2 }, activeTargetId: 'T01', targets: [target], terrain: { gunElevation: null, targetElevation: null, deltaZ: null, status: 'unavailable' as const } };
  it('round-trips desktop schema 1', () => {
    const document = exportDocument(state);
    expect(document.schema).toBe(1);
    expect(importDocument(document, state)).toMatchObject({ mapId: 'bakurani', activeTargetId: 'T01', targets: [target] });
  });
  it('rejects corrupt data', () => { expect(importDocument({ schema: 1, settings: {}, targets: [{ bad: true }] }, state)).toBeNull(); });
});

describe('terrain interpolation', () => {
  it('bilinearly samples decimeter chunks', () => {
    const data = new Int16Array([0, 10, 20, 30]);
    expect(sampleChunk(data, 2, 2, .5, .5)).toBeCloseTo(1.5);
  });
});
