import { describe, it, expect } from 'vitest';
import { contourInterval } from '../src/contours';
describe('contour LOD', () => {
  it('uses map scale, independent of screen pixel ratio', () => {
    expect(contourInterval(25)).toBe(10);
    expect(contourInterval(50)).toBe(5);
    expect(contourInterval(100)).toBe(2);
    expect(contourInterval(400)).toBe(2);
  });
});
