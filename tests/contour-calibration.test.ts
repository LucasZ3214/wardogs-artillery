import { expect, it } from 'vitest';
import { DEFAULT_CONTOUR_OFFSET } from '../src/ContourCalibration';

it('uses the user-approved east/north visual offset in meters', () => {
  expect(DEFAULT_CONTOUR_OFFSET).toEqual({ east: 27, north: 27 });
});
