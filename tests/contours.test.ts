import { describe, it, expect } from 'vitest';
import { contourInterval, decodeContourResponse } from '../src/contours';
describe('contour LOD', () => {
  it('accepts already decompressed JSON from local preview', async () => {
    const lines = [[50, [[1, 2], [3, 4]]]];
    expect(await decodeContourResponse(new Response(JSON.stringify(lines)))).toEqual(lines);
  });
  it('accepts raw gzip assets from static hosting', async () => {
    const lines = [[50, [[1, 2], [3, 4]]]];
    const compressed = new Blob([JSON.stringify(lines)]).stream().pipeThrough(new CompressionStream('gzip'));
    expect(await decodeContourResponse(new Response(compressed))).toEqual(lines);
  });
  it('rejects an invalid response instead of drawing corrupt data', async () => {
    await expect(decodeContourResponse(new Response('<html>error</html>'))).rejects.toThrow();
  });
  it('uses map scale, independent of screen pixel ratio', () => {
    expect(contourInterval(25)).toBe(10);
    expect(contourInterval(50)).toBe(5);
    expect(contourInterval(100)).toBe(2);
    expect(contourInterval(400)).toBe(2);
  });
});
