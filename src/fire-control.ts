export type Point = { x: number; y: number };
export type WeaponId = 'mortar' | 'spg';
export type Arc = 'single' | 'low' | 'high';
export type MapMode = 'gun' | 'target' | 'impact';
export type MapStyle = 'grayscale' | 'color';

export type Impact = {
  id: string;
  point: Point;
  aimBefore: Point;
  aimAfter: Point;
  errorMeters: Point;
  createdAt: string;
};

export type Target = {
  id: string;
  name: string;
  mapId: string;
  point: Point;
  aimPoint: Point;
  weaponId: WeaponId;
  arc: Arc;
  impacts: Impact[];
  createdAt: string;
  lastUsedAt: string;
};

export type TerrainInfo = {
  gunElevation: number | null;
  targetElevation: number | null;
  deltaZ: number | null;
  status: 'pending' | 'ready' | 'unavailable';
};

export type FireControlState = {
  mapId: string;
  weaponId: WeaponId;
  arc: Arc;
  gun: Point;
  activeTargetId: string | null;
  targets: Target[];
  terrain: TerrainInfo;
};

export type MapMarker = { icon: string; x: number; y: number; label: string; minZoom?: number };
export type MapConfig = {
  id: string;
  name: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  tileBounds: { minX: number; maxX: number; minY: number; maxY: number };
  tiles: Record<MapStyle, string>;
  markers: MapMarker[];
};

const CDN = 'https://assets.wardogs-artillery.com/releases/assets-v1/maps';
const tileSources = (mapId: string): Record<MapStyle, string> => ({
  grayscale: `${CDN}/tiles/${mapId}`,
  color: `${CDN}/tiles-color/${mapId}`,
});
const marker = (icon: string, x: number, y: number, label: string, minZoom = 0.4): MapMarker => ({ icon, x: x / 100, y: y / 100, label, minZoom });

export const MAPS: Record<string, MapConfig> = {
  bakurani: {
    id: 'bakurani', name: 'BAKURANI', bounds: { minX: 23.35, maxX: 133.6, minY: 19.34, maxY: 129.65 },
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 }, tiles: tileSources('bakurani'),
    markers: [
      marker('tower', 8052, 6985, 'Tower 1'), marker('tower', 7719, 7000, 'Tower 2'), marker('tower', 7719, 7344, 'Tower 3'), marker('tower', 8364, 7285, 'Tower 4'), marker('tower', 8222, 6841, 'Tower 5'),
      marker('valkyra', 11875, 7093, 'Valkyra', 2), marker('manticore', 4009, 7752, 'Manticore', 2), marker('lonestar', 8746, 3250, 'Lonestar', 2),
      marker('spawn_board', 11837, 7049, 'Spawn Board', 4), marker('garage_vendor', 4010, 7731, 'Garage Vendor', 4), marker('weapons_vendor', 8720, 3268, 'Weapons Vendor', 4),
    ],
  },
  ozeti: {
    id: 'ozeti', name: 'OZETI', bounds: { minX: 57.58, maxX: 143.07, minY: 21.81, maxY: 99.56 },
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 }, tiles: tileSources('ozeti'),
    markers: [
      marker('tower', 9580, 6282, 'Tower 1'), marker('tower', 10037, 5923, 'Tower 2'), marker('tower', 10449, 6371, 'Tower 3'), marker('tower', 10062, 6764, 'Tower 4'),
      marker('valkyra', 13803, 6733, 'Valkyra', 2), marker('manticore', 6828, 8803, 'Manticore', 2), marker('lonestar', 8373, 3069, 'Lonestar', 2),
      marker('spawn_board', 13788, 6726, 'Spawn Board', 4), marker('garage_vendor', 6866, 8792, 'Garage Vendor', 4), marker('weapons_vendor', 8385, 3088, 'Weapons Vendor', 4),
    ],
  },
  zestafona: {
    id: 'zestafona', name: 'ZESTAFONA', bounds: { minX: 19.9, maxX: 124.89, minY: 50.7, maxY: 141.9 },
    tileBounds: { minX: -0.03, maxX: 163.81, minY: -0.01, maxY: 163.83 }, tiles: tileSources('zestafona'),
    markers: [
      marker('tower', 6859.9808, 10415.3, 'Tower 1'), marker('tower', 7289.2416, 10507.0592, 'Tower 2'), marker('tower', 7017.2672, 10017.17, 'Tower 3'),
      marker('valkyra', 3943.6288, 12494.4384, 'Valkyra', 2), marker('manticore', 10466.0992, 11508.1216, 'Manticore', 2), marker('lonestar', 6800.9984, 6660.096, 'Lonestar', 2),
      marker('spawn_board', 3889.5616, 12486.2464, 'Spawn Board', 4), marker('garage_vendor', 10466.0992, 11454.0544, 'Garage Vendor', 4),
    ],
  },
};

export const MORTAR_DISTANCES = [80,87,93,99,105,110,115,118,122,127,132,140,151,163,175,187,198,208,219,229,239,250,260,270,280,290,300,310,319,329,339,348,358,367,376,385,394,403,412,420,429,437,446,454,462,470,478,486,494,501,509,516,524,531,538,545,552,559,565,572,578,585,591,597,603,609,615,620,626,631,636,641,646,651,656,661,666,670,675,680,684,688,693,697];
export const SPG_LOW_DISTANCES = [1181,1232,1283,1334,1384,1433,1482,1529,1576,1622,1666,1709,1751,1792,1832,1870,1907,1944,1979,2014,2046,2079,2110,2139,2168,2196,2223,2249,2273,2296,2319,2341,2362,2383,2403,2422,2439,2456,2471,2485,2499,2513,2526,2538,2550,2561,2570,2579,2586,2593,2599,2605,2610,2615,2620,2623,2626,2628,2629];
export const SPG_HIGH_DISTANCES = [2629,2629,2628,2626,2624,2621,2617,2613,2609,2604,2599,2592,2584,2576,2567,2557,2546,2536,2524,2513,2501,2488,2474,2460,2444,2429,2412,2395,2378,2360,2342,2323,2303,2282,2261,2239,2217,2194,2171,2147,2123,2098,2072,2046,2019,1991,1963,1934,1905,1875,1844,1813,1782,1750,1717,1684,1650,1616,1582,1547,1512,1475,1438,1401,1363,1324,1285,1245,1205,1165,1124,1083,1041,999,956,913,869,825,780,735];

export const MAX_RANGE_METERS: Record<WeaponId, number> = { mortar: 697, spg: 2629 };
export type Solution = { valid: boolean; bearing: number; distance: number; mil: number; arc: Arc; reason?: string };

export function interpolateMil(distance: number, distances: number[], milStart: number, milStep: number): number | null {
  for (let i = 0; i < distances.length - 1; i += 1) {
    const a = distances[i]; const b = distances[i + 1];
    if (distance < Math.min(a, b) || distance > Math.max(a, b) || a === b) continue;
    return milStart + i * milStep + ((distance - a) / (b - a)) * milStep;
  }
  const exact = distances.findIndex((item) => item === distance);
  return exact >= 0 ? milStart + exact * milStep : null;
}

export function calculateSolution(gun: Point, aim: Point | null, weapon: WeaponId, arc: Arc): Solution {
  if (!aim) return { valid: false, bearing: 0, distance: 0, mil: 0, arc, reason: 'no-target' };
  const dx = aim.x - gun.x; const dy = aim.y - gun.y;
  const distance = Math.hypot(dx, dy) * 100;
  const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  const mil = weapon === 'mortar'
    ? interpolateMil(distance, MORTAR_DISTANCES, 950, -10)
    : arc === 'low'
      ? interpolateMil(distance, SPG_LOW_DISTANCES, 20, 10)
      : interpolateMil(distance, SPG_HIGH_DISTANCES, 610, 10);
  return mil == null ? { valid: false, bearing, distance, mil: 0, arc, reason: 'out-of-range' } : { valid: true, bearing, distance, mil, arc };
}

export function correctionRadius(weapon: WeaponId, rangeMeters: number) {
  const limit = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return weapon === 'mortar' ? limit(rangeMeters * 0.1, 30, 80) : limit(rangeMeters * 0.1, 75, 250);
}

export function nextTargetId(targets: Target[]) {
  const max = targets.reduce((value, target) => Math.max(value, Number(target.id.slice(1)) || 0), 0);
  return `T${String(max + 1).padStart(2, '0')}`;
}

export function applyImpact(target: Target, point: Point): Target {
  const before = target.aimPoint;
  const after = { x: before.x - (point.x - target.point.x), y: before.y - (point.y - target.point.y) };
  const impact: Impact = {
    id: `${target.id}-I${target.impacts.length + 1}`, point, aimBefore: before, aimAfter: after,
    errorMeters: { x: (point.x - target.point.x) * 100, y: (point.y - target.point.y) * 100 }, createdAt: new Date().toISOString(),
  };
  return { ...target, aimPoint: after, impacts: [...target.impacts, impact] };
}

export function resetCorrections(targets: Target[]) {
  return targets.map((target) => ({ ...target, aimPoint: target.point, impacts: [] }));
}
