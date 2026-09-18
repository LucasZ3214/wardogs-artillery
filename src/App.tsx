import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContourCalibration, useContourOffset } from './ContourCalibration';
import { Check, Circle, CircleDot, CircleOff, Crosshair, Download, FlipHorizontal2, History, LocateFixed, Maximize, Menu, Pencil, RotateCcw, Target as TargetIcon, Trash2, Undo2, Upload, X } from 'lucide-react';
import { TacticalMap } from './TacticalMap';
import { MAPS, applyImpact, calculateSolution, controlZoneCentersFromEdgePoints, nextTargetId, orderControlZoneCentersToward, resetCorrections, type Arc, type ControlZone, type FireControlState, type MapMode, type MapStyle, type Point, type Target, type WeaponId } from './fire-control';
import { exportDocument, importDocument, loadState, saveState } from './persistence';
import { sampleTerrainPair } from './terrain';

const emptyTerrain = { gunElevation: null, targetElevation: null, deltaZ: null, status: 'pending' as const };
const CONTROL_ZONE_STORAGE_KEY = 'wardogs-control-zones-v1';
type ControlZonesByMap = Record<string, ControlZone | null>;

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<Point>;
  return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y);
}

function loadControlZones(): ControlZonesByMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTROL_ZONE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([mapId, value]) => {
      if (!value || typeof value !== 'object' || !isPoint((value as ControlZone).center)) return [];
      const raw = value as Partial<ControlZone>;
      const edgePoints = Array.isArray(raw.edgePoints) && raw.edgePoints.length === 2 && isPoint(raw.edgePoints[0]) && isPoint(raw.edgePoints[1])
        ? [raw.edgePoints[0], raw.edgePoints[1]] as [Point, Point]
        : null;
      return [[mapId, { center: raw.center as Point, alternateCenter: isPoint(raw.alternateCenter) ? raw.alternateCenter : null, edgePoints }]];
    }));
  } catch { return {}; }
}

function battlefieldCenter(mapId: string): Point {
  const map = MAPS[mapId];
  const towers = map.markers.filter((marker) => marker.icon === 'tower');
  if (!towers.length) return { x: (map.bounds.minX + map.bounds.maxX) / 2, y: (map.bounds.minY + map.bounds.maxY) / 2 };
  return { x: towers.reduce((sum, tower) => sum + tower.x, 0) / towers.length, y: towers.reduce((sum, tower) => sum + tower.y, 0) / towers.length };
}
const now = new Date().toISOString();
const INITIAL_STATE: FireControlState = {
  mapId: 'bakurani', weaponId: 'mortar', arc: 'single', gun: { x: 80, y: 76.5 }, activeTargetId: 'T01',
  targets: [{ id: 'T01', name: '塔楼观察点', mapId: 'bakurani', point: { x: 83.64, y: 72.85 }, aimPoint: { x: 83.64, y: 72.85 }, weaponId: 'mortar', arc: 'single', impacts: [], createdAt: now, lastUsedAt: now }],
  terrain: emptyTerrain,
};

export default function App() {
  const [state, setState] = useState<FireControlState>(() => loadState(INITIAL_STATE));
  const [mode, setMode] = useState<MapMode>('target');
  const [contourOffset, setContourOffset] = useContourOffset(state.mapId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [contoursEnabled, setContoursEnabled] = useState(false);
  const [toast, setToast] = useState('纯前端模式 · 点击地图建立目标');
  const [undoSnapshot, setUndoSnapshot] = useState<FireControlState | null>(null);
  const [mapResetKey, setMapResetKey] = useState(0);
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => localStorage.getItem('wardogs-map-style-v1') === 'color' ? 'color' : 'grayscale');
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [controlZones, setControlZones] = useState<ControlZonesByMap>(loadControlZones);
  const [czEdgeStart, setCzEdgeStart] = useState<Point | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const gunResetNoticeRef = useRef(false);
  const activeTarget = useMemo(() => state.targets.find((target) => target.id === state.activeTargetId && target.mapId === state.mapId) ?? null, [state.activeTargetId, state.mapId, state.targets]);
  const mapTargets = useMemo(() => state.targets.filter((target) => target.mapId === state.mapId), [state.mapId, state.targets]);
  const solution = useMemo(() => calculateSolution(state.gun, activeTarget?.aimPoint ?? null, state.weaponId, state.arc), [activeTarget, state.arc, state.gun, state.weaponId]);
  const controlZone = controlZones[state.mapId] ?? null;

  useEffect(() => {
    if (!editingTargetId) return;
    const frame = window.requestAnimationFrame(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); });
    return () => window.cancelAnimationFrame(frame);
  }, [editingTargetId]);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { localStorage.setItem('wardogs-map-style-v1', mapStyle); }, [mapStyle]);
  useEffect(() => { localStorage.setItem(CONTROL_ZONE_STORAGE_KEY, JSON.stringify(controlZones)); }, [controlZones]);
  useEffect(() => {
    let stale = false;
    const timer = window.setTimeout(() => {
      if (!activeTarget) {
        setState((current) => ({ ...current, terrain: { ...emptyTerrain, status: 'unavailable' } }));
        return;
      }
      setState((current) => ({ ...current, terrain: emptyTerrain }));
      void sampleTerrainPair(state.mapId, state.gun, activeTarget.point).then((terrain) => { if (!stale) setState((current) => ({ ...current, terrain })); });
    }, activeTarget ? 120 : 0);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [activeTarget, state.gun, state.mapId]);

  const snapshot = useCallback(() => setUndoSnapshot(structuredClone(state)), [state]);
  const selectTarget = useCallback((id: string) => {
    setState((current) => ({ ...current, activeTargetId: id, targets: current.targets.map((target) => target.id === id ? { ...target, lastUsedAt: new Date().toISOString() } : target) }));
    setToast(`已切换到 ${id}`);
  }, []);
  const createTarget = useCallback((point: Point) => {
    const id = nextTargetId(state.targets); const stamp = new Date().toISOString();
    const target: Target = { id, name: `目标 ${id.slice(1)}`, mapId: state.mapId, point, aimPoint: point, weaponId: state.weaponId, arc: state.arc, impacts: [], createdAt: stamp, lastUsedAt: stamp };
    setState((current) => ({ ...current, activeTargetId: id, targets: [...current.targets, target] })); setToast(`${id} 已建立`); return id;
  }, [state.arc, state.mapId, state.targets, state.weaponId]);
  const setCurrentControlZone = useCallback((zone: ControlZone | null) => {
    setControlZones((current) => ({ ...current, [state.mapId]: zone }));
  }, [state.mapId]);
  const handleMapClick = useCallback((point: Point) => {
    if (mode === 'control-zone') {
      setCurrentControlZone({ center: point, alternateCenter: null, edgePoints: null });
      setCzEdgeStart(null); setToast('CZ 圆心已放置，可直接拖动'); return;
    }
    if (mode === 'control-zone-edge') {
      if (!czEdgeStart) { setCzEdgeStart(point); setToast('已记录第一个圆边点，请选择第二点'); return; }
      const centers = controlZoneCentersFromEdgePoints(czEdgeStart, point);
      if (!centers) { setCzEdgeStart(point); setToast('两点重合或超过 CZ 直径，已重新选择第一点'); return; }
      const [center, alternateCenter] = orderControlZoneCentersToward(centers, battlefieldCenter(state.mapId));
      setCurrentControlZone({ center, alternateCenter, edgePoints: [czEdgeStart, point] });
      setCzEdgeStart(null); setToast('CZ 已朝塔楼群中心放置，可用翻转按钮切换镜像位置'); return;
    }
    snapshot();
    if (mode === 'gun') {
      setState((current) => ({ ...current, gun: point, targets: resetCorrections(current.targets) })); setToast('炮位已更新，所有目标校射已重置'); return;
    }
    if (mode === 'target') { createTarget(point); return; }
    if (!activeTarget) { setUndoSnapshot(null); setToast('请先选择一个目标，再记录落点'); return; }
    const missMeters = Math.hypot(point.x - activeTarget.point.x, point.y - activeTarget.point.y) * 100;
    setState((current) => ({ ...current, targets: current.targets.map((target) => target.id === activeTarget.id ? applyImpact(target, point) : target) }));
    setToast(`已记录落点，偏差 ${Math.round(missMeters)}m`);
  }, [activeTarget, createTarget, czEdgeStart, mode, setCurrentControlZone, snapshot, state.mapId]);
  const handleMarkerMove = useCallback((kind: 'gun' | 'target' | 'control-zone', id: string | null, point: Point) => {
    if (kind === 'control-zone') { setCurrentControlZone({ center: point, alternateCenter: null, edgePoints: null }); return; }
    if (kind === 'gun') setState((current) => {
      gunResetNoticeRef.current ||= current.targets.some((target) => target.impacts.length > 0);
      return { ...current, gun: point, targets: resetCorrections(current.targets) };
    });
    else if (id) setState((current) => ({ ...current, targets: current.targets.map((target) => {
      if (target.id !== id) return target;
      const offset = { x: target.aimPoint.x - target.point.x, y: target.aimPoint.y - target.point.y };
      return { ...target, point, aimPoint: { x: point.x + offset.x, y: point.y + offset.y } };
    }) }));
  }, [setCurrentControlZone]);
  const handleMarkerMoveEnd = useCallback((kind: 'gun' | 'target' | 'control-zone') => {
    if (kind === 'control-zone') { setToast('CZ 圆心已移动'); return; }
    if (kind === 'gun') { if (gunResetNoticeRef.current) setToast('炮位已移动，所有目标校射已重置'); gunResetNoticeRef.current = false; }
    else setToast('目标位置已更新');
  }, []);
  const changeMode = (nextMode: MapMode) => { setMode(nextMode); if (nextMode !== 'control-zone-edge') setCzEdgeStart(null); };
  const flipControlZone = () => {
    if (!controlZone?.alternateCenter) return;
    setCurrentControlZone({ ...controlZone, center: controlZone.alternateCenter, alternateCenter: controlZone.center }); setToast('已切换到另一侧 CZ 圆心');
  };
  const clearControlZone = () => { setCurrentControlZone(null); setCzEdgeStart(null); setToast('当前地图 CZ 已清除'); };
  const updateMap = (mapId: string) => {
    setCzEdgeStart(null);
    snapshot(); const nextMap = MAPS[mapId]; const visible = state.targets.filter((target) => target.mapId === mapId);
    setState((current) => ({ ...current, mapId, gun: { x: (nextMap.bounds.minX + nextMap.bounds.maxX) / 2, y: (nextMap.bounds.minY + nextMap.bounds.maxY) / 2 }, activeTargetId: visible[0]?.id ?? null, terrain: emptyTerrain }));
  };
  const updateWeapon = (weaponId: WeaponId) => setState((current) => ({ ...current, weaponId, arc: weaponId === 'mortar' ? 'single' : current.arc === 'single' ? 'high' : current.arc }));
  const undo = () => { if (!undoSnapshot) return; setState(undoSnapshot); setUndoSnapshot(null); setToast('已撤销上一步'); };
  const undoImpact = () => {
    if (!activeTarget?.impacts.length) return;
    snapshot(); const impacts = activeTarget.impacts.slice(0, -1); const aimPoint = impacts.at(-1)?.aimAfter ?? activeTarget.point;
    setState((current) => ({ ...current, targets: current.targets.map((target) => target.id === activeTarget.id ? { ...target, impacts, aimPoint } : target) })); setToast('已撤销最后落点');
  };
  const clearCorrections = () => {
    if (!activeTarget) return; snapshot(); setState((current) => ({ ...current, targets: current.targets.map((target) => target.id === activeTarget.id ? { ...target, impacts: [], aimPoint: target.point } : target) })); setToast(`${activeTarget.id} 校射已清空`);
  };
  const deleteTarget = (id: string) => {
    const deleted = state.targets.find((target) => target.id === id); if (!deleted) return; snapshot();
    setState((current) => {
      const remaining = current.targets.filter((target) => target.id !== id);
      const next = remaining.filter((target) => target.mapId === current.mapId).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
      return { ...current, targets: remaining, activeTargetId: current.activeTargetId === id ? next?.id ?? null : current.activeTargetId };
    });
    if (editingTargetId === id) { setEditingTargetId(null); setRenameDraft(''); }
    setToast(`${id} 已删除`);
  };
  const beginRename = (target: Target) => { setEditingTargetId(target.id); setRenameDraft(target.name); };
  const cancelRename = () => { setEditingTargetId(null); setRenameDraft(''); };
  const saveRename = (id: string) => {
    const name = renameDraft.trim(); if (!name) { setToast('目标名称不能为空'); return; }
    const stamp = new Date().toISOString();
    setState((current) => ({ ...current, targets: current.targets.map((target) => target.id === id ? { ...target, name, lastUsedAt: stamp } : target) }));
    setEditingTargetId(null); setRenameDraft(''); setToast(`${id} 已重命名为 ${name}`);
  };
  const downloadHistory = () => {
    const blob = new Blob([JSON.stringify(exportDocument(state), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `wardogs-targets-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importHistory = async (file: File | undefined) => {
    if (!file) return;
    try { const imported = importDocument(JSON.parse(await file.text()), INITIAL_STATE); if (!imported) throw new Error(); snapshot(); setState(imported); setToast('历史记录已导入'); }
    catch { setToast('导入失败：文件格式不正确'); }
  };
  const toggleFullscreen = async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
    catch { setToast('Chrome 当前不允许进入全屏'); }
  };
  const history = state.targets.filter((target) => target.mapId === state.mapId).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  const result = (value: number, digits = 0) => solution.valid ? value.toFixed(digits) : '—';

  return <main className="app-shell">
    <header className="solution-bar">
      <button className="target-chip" onClick={() => setHistoryOpen(true)} aria-label="打开目标历史"><span>目标</span><strong>{activeTarget?.id ?? '—'}</strong></button>
      <Result label="方位" value={result(solution.bearing)} unit="°" />
      <Result label="距离" value={result(solution.distance)} unit="m" />
      <Result label="仰角" value={result(solution.mil)} unit="mil" />
      <div className="arc-readout"><span>弹道</span><strong>{state.weaponId === 'mortar' ? 'L81' : state.arc === 'high' ? '高弧' : '低弧'}</strong></div>
      <div className={`terrain-readout terrain-readout--${state.terrain.status}`} title="Terrain3D 相对高差，仅供参考，不参与密位计算"><span>ΔZ</span><strong>{state.terrain.status === 'ready' && state.terrain.deltaZ != null ? `${state.terrain.deltaZ >= 0 ? '+' : ''}${state.terrain.deltaZ.toFixed(1)}` : '—'}</strong><small>m</small></div>
    </header>

    <TacticalMap contourOffset={contourOffset} contoursEnabled={contoursEnabled} map={MAPS[state.mapId]} mapStyle={mapStyle} gun={state.gun} weaponId={state.weaponId} targets={mapTargets} activeTargetId={state.activeTargetId} mode={mode} resetKey={mapResetKey} controlZone={controlZone} czEdgeStart={czEdgeStart} onMapClick={handleMapClick} onTargetSelect={selectTarget} onMarkerMove={handleMarkerMove} onMarkerMoveEnd={handleMarkerMoveEnd} />

      <section className="control-pod map-layer-pod" aria-label="地图与等高线设置">
        <div className="control-pod__body">
        <label>地图<select value={state.mapId} onChange={(event) => updateMap(event.target.value)}>{Object.values(MAPS).map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
        <label>图层<select value={mapStyle} onChange={(event) => setMapStyle(event.target.value as MapStyle)}><option value="grayscale">灰度</option><option value="color">彩色</option></select></label>
        <label>等高线<select aria-label="等高线" value={contoursEnabled ? 'on' : 'off'} onChange={event => setContoursEnabled(event.target.value === 'on')}><option value="off">关闭</option><option value="on">开启 · 10 / 5 / 2m</option></select></label>
        {contoursEnabled && <ContourCalibration value={contourOffset} onChange={setContourOffset} />}
        </div>
      </section>
    <section className={`control-pod ${controlsOpen ? '' : 'control-pod--closed'}`} aria-label="地图和武器设置">
      <button className="icon-button control-toggle" onClick={() => setControlsOpen((value) => !value)} aria-label={controlsOpen ? '收起设置' : '展开设置'}>{controlsOpen ? <X /> : <Menu />}</button>
      {controlsOpen && <div className="control-pod__body">
        <label>武器<select value={state.weaponId} onChange={(event) => updateWeapon(event.target.value as WeaponId)}><option value="mortar">L81 MORTAR</option><option value="spg">SPH-2</option></select></label>
        {state.weaponId === 'spg' && <label>弹道<select value={state.arc} onChange={(event) => setState((current) => ({ ...current, arc: event.target.value as Arc }))}><option value="high">高弧</option><option value="low">低弧</option></select></label>}
      </div>}
    </section>

    <nav className="map-actions" aria-label="地图操作">
      <button className="icon-button" onClick={undo} disabled={!undoSnapshot} aria-label="撤销"><Undo2 /></button>
      <button className="icon-button" onClick={undoImpact} disabled={!activeTarget?.impacts.length} aria-label="撤销最后落点"><RotateCcw /></button>
      <button className="icon-button" onClick={clearCorrections} disabled={!activeTarget?.impacts.length} aria-label="清空当前目标校射"><Crosshair /></button>
      <button className="icon-button danger" onClick={() => activeTarget && deleteTarget(activeTarget.id)} disabled={!activeTarget} aria-label="删除当前目标"><Trash2 /></button>
      <button className="icon-button" onClick={flipControlZone} disabled={!controlZone?.alternateCenter} aria-label="翻转 CZ 镜像圆心"><FlipHorizontal2 /></button>
      <button className="icon-button" onClick={clearControlZone} disabled={!controlZone && !czEdgeStart} aria-label="清除 CZ"><CircleOff /></button>
      <button className="icon-button" onClick={() => setMapResetKey((value) => value + 1)} aria-label="复位地图"><LocateFixed /></button>
      <button className="icon-button" onClick={toggleFullscreen} aria-label="全屏"><Maximize /></button>
    </nav>

    <nav className="mode-switcher" aria-label="标点模式">
      <ModeButton active={mode === 'gun'} onClick={() => changeMode('gun')} icon={<LocateFixed />} label="炮位" />
      <ModeButton active={mode === 'target'} onClick={() => changeMode('target')} icon={<TargetIcon />} label="目标" />
      <ModeButton active={mode === 'impact'} onClick={() => changeMode('impact')} icon={<Crosshair />} label="落点" />
    </nav>
    <nav className="cz-mode-switcher" aria-label="Control Zone 绘制模式">
      <ModeButton active={mode === 'control-zone'} onClick={() => changeMode('control-zone')} icon={<CircleDot />} label="CZ中心" />
      <ModeButton active={mode === 'control-zone-edge'} onClick={() => changeMode('control-zone-edge')} icon={<Circle />} label="CZ两点" />
    </nav>

    <button className="history-tab" onClick={() => setHistoryOpen(true)}><History /> <span>历史</span></button>
    <div className="status-toast">{toast}</div>
    <div className="map-attribution">非官方工具 · Map &amp; Terrain data: wardogs-calculator community project</div>

    {historyOpen && <div className="sheet-backdrop" onPointerDown={() => setHistoryOpen(false)}>
      <aside className="history-sheet" onPointerDown={(event) => event.stopPropagation()} aria-label="目标历史">
        <div className="sheet-header"><div><span className="eyebrow">TARGET LOG</span><h2>目标历史</h2></div><button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="关闭"><X /></button></div>
        <div className="history-tools"><button onClick={downloadHistory}><Download />导出</button><button onClick={() => importInputRef.current?.click()}><Upload />导入</button><input ref={importInputRef} hidden type="file" accept="application/json" onChange={(event) => void importHistory(event.target.files?.[0])} /></div>
        <div className="history-list">{history.length ? history.map((target) => {
          const targetSolution = calculateSolution(state.gun, target.aimPoint, state.weaponId, state.arc);
          const editing = editingTargetId === target.id;
          return <article key={target.id} className={`history-card ${target.id === state.activeTargetId ? 'is-active' : ''}`}>
            {editing ? <div className="history-card__rename"><strong>{target.id}</strong><input ref={renameInputRef} maxLength={80} value={renameDraft} aria-label={`重命名 ${target.id}`} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveRename(target.id); if (event.key === 'Escape') cancelRename(); }} /></div> : <button className="history-card__select" aria-label={`切换到 ${target.id} ${target.name}`} onClick={() => { selectTarget(target.id); setHistoryOpen(false); }}><div className="history-card__title"><strong>{target.id}</strong><span>{target.name}</span></div></button>}
            <div className="history-card__metrics"><span>{targetSolution.valid ? `${Math.round(targetSolution.bearing)}°` : '超界'}</span><span>{targetSolution.valid ? `${Math.round(targetSolution.distance)}m` : '—'}</span><span>{targetSolution.valid ? `${Math.round(targetSolution.mil)}mil` : '—'}</span></div>
            <div className="history-card__footer"><span>{target.impacts.length ? `已校射 ${target.impacts.length} 次` : '未校射'}</span><div className="history-card__actions">{editing ? <><button aria-label={`保存 ${target.id} 名称`} onClick={() => saveRename(target.id)}><Check /></button><button aria-label="取消重命名" onClick={cancelRename}><X /></button></> : <><button aria-label={`重命名 ${target.id}`} onClick={() => beginRename(target)}><Pencil /></button><button className="history-card__delete" aria-label={`删除 ${target.id}`} onClick={() => deleteTarget(target.id)}><Trash2 /></button></>}</div></div>
          </article>;
        }) : <div className="empty-state">当前地图还没有目标</div>}</div>
        <p className="legal-note">历史仅保存在此浏览器。Terrain3D 仅显示相对高差，不修正射击密位。</p>
      </aside>
    </div>}
  </main>;
}

function Result({ label, value, unit }: { label: string; value: string; unit: string }) { return <div className="solution-value"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>; }
function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>; }
