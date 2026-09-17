import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Download, History, LocateFixed, Maximize, Menu, RotateCcw, Settings2, Target as TargetIcon, Trash2, Undo2, Upload, X } from 'lucide-react';
import { TacticalMap } from './TacticalMap';
import { MAPS, applyImpact, calculateSolution, correctionRadius, nextTargetId, resetCorrections, type Arc, type FireControlState, type MapMode, type MapStyle, type Point, type Target, type WeaponId } from './fire-control';
import { exportDocument, importDocument, loadState, saveState } from './persistence';
import { sampleTerrainPair } from './terrain';

const emptyTerrain = { gunElevation: null, targetElevation: null, deltaZ: null, status: 'pending' as const };
const now = new Date().toISOString();
const INITIAL_STATE: FireControlState = {
  mapId: 'bakurani', weaponId: 'mortar', arc: 'single', gun: { x: 80, y: 76.5 }, activeTargetId: 'T01',
  targets: [{ id: 'T01', name: '塔楼观察点', mapId: 'bakurani', point: { x: 83.64, y: 72.85 }, aimPoint: { x: 83.64, y: 72.85 }, weaponId: 'mortar', arc: 'single', impacts: [], createdAt: now, lastUsedAt: now }],
  terrain: emptyTerrain,
};

export default function App() {
  const [state, setState] = useState<FireControlState>(() => loadState(INITIAL_STATE));
  const [mode, setMode] = useState<MapMode>('target');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [toast, setToast] = useState('纯前端模式 · 点击地图建立目标');
  const [undoSnapshot, setUndoSnapshot] = useState<FireControlState | null>(null);
  const [mapResetKey, setMapResetKey] = useState(0);
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => localStorage.getItem('wardogs-map-style-v1') === 'color' ? 'color' : 'grayscale');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const gunResetNoticeRef = useRef(false);
  const activeTarget = useMemo(() => state.targets.find((target) => target.id === state.activeTargetId && target.mapId === state.mapId) ?? null, [state.activeTargetId, state.mapId, state.targets]);
  const mapTargets = useMemo(() => state.targets.filter((target) => target.mapId === state.mapId), [state.mapId, state.targets]);
  const solution = useMemo(() => calculateSolution(state.gun, activeTarget?.aimPoint ?? null, state.weaponId, state.arc), [activeTarget, state.arc, state.gun, state.weaponId]);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { localStorage.setItem('wardogs-map-style-v1', mapStyle); }, [mapStyle]);
  useEffect(() => {
    let stale = false;
    if (!activeTarget) { setState((current) => ({ ...current, terrain: { ...emptyTerrain, status: 'unavailable' } })); return; }
    setState((current) => ({ ...current, terrain: emptyTerrain }));
    const timer = window.setTimeout(() => {
      sampleTerrainPair(state.mapId, state.gun, activeTarget.point).then((terrain) => { if (!stale) setState((current) => ({ ...current, terrain })); });
    }, 120);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [activeTarget?.id, activeTarget?.point.x, activeTarget?.point.y, state.gun.x, state.gun.y, state.mapId]);

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
  const handleMapClick = useCallback((point: Point) => {
    snapshot();
    if (mode === 'gun') {
      setState((current) => ({ ...current, gun: point, targets: resetCorrections(current.targets) })); setToast('炮位已更新，所有目标校射已重置'); return;
    }
    if (mode === 'target' || !activeTarget) { createTarget(point); return; }
    const missMeters = Math.hypot(point.x - activeTarget.point.x, point.y - activeTarget.point.y) * 100;
    const targetRange = Math.hypot(activeTarget.point.x - state.gun.x, activeTarget.point.y - state.gun.y) * 100;
    if (missMeters > correctionRadius(state.weaponId, targetRange)) { createTarget(point); setToast(`偏差 ${Math.round(missMeters)}m，已作为新目标；可撤销`); return; }
    setState((current) => ({ ...current, targets: current.targets.map((target) => target.id === activeTarget.id ? applyImpact(target, point) : target) }));
    setToast(`已记录落点，偏差 ${Math.round(missMeters)}m`);
  }, [activeTarget, createTarget, mode, snapshot, state.gun, state.weaponId]);
  const handleMarkerMove = useCallback((kind: 'gun' | 'target', id: string | null, point: Point) => {
    if (kind === 'gun') setState((current) => {
      gunResetNoticeRef.current ||= current.targets.some((target) => target.impacts.length > 0);
      return { ...current, gun: point, targets: resetCorrections(current.targets) };
    });
    else if (id) setState((current) => ({ ...current, targets: current.targets.map((target) => {
      if (target.id !== id) return target;
      const offset = { x: target.aimPoint.x - target.point.x, y: target.aimPoint.y - target.point.y };
      return { ...target, point, aimPoint: { x: point.x + offset.x, y: point.y + offset.y } };
    }) }));
  }, []);
  const handleMarkerMoveEnd = useCallback((kind: 'gun' | 'target') => {
    if (kind === 'gun') { if (gunResetNoticeRef.current) setToast('炮位已移动，所有目标校射已重置'); gunResetNoticeRef.current = false; }
    else setToast('目标位置已更新');
  }, []);
  const updateMap = (mapId: string) => {
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
  const deleteTarget = () => {
    if (!activeTarget) return; snapshot(); const remaining = state.targets.filter((target) => target.id !== activeTarget.id); const next = remaining.filter((target) => target.mapId === state.mapId).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
    setState((current) => ({ ...current, targets: remaining, activeTargetId: next?.id ?? null })); setToast(`${activeTarget.id} 已删除`); setDeleteConfirm(false);
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
  const history = [...state.targets].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
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

    <TacticalMap map={MAPS[state.mapId]} mapStyle={mapStyle} gun={state.gun} weaponId={state.weaponId} targets={mapTargets} activeTargetId={state.activeTargetId} mode={mode} resetKey={mapResetKey} onMapClick={handleMapClick} onTargetSelect={selectTarget} onMarkerMove={handleMarkerMove} onMarkerMoveEnd={(kind) => handleMarkerMoveEnd(kind)} />

    <section className={`control-pod ${controlsOpen ? '' : 'control-pod--closed'}`} aria-label="地图和武器设置">
      <button className="icon-button control-toggle" onClick={() => setControlsOpen((value) => !value)} aria-label={controlsOpen ? '收起设置' : '展开设置'}>{controlsOpen ? <X /> : <Menu />}</button>
      {controlsOpen && <div className="control-pod__body">
        <label>地图<select value={state.mapId} onChange={(event) => updateMap(event.target.value)}>{Object.values(MAPS).map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
        <label>图层<select value={mapStyle} onChange={(event) => setMapStyle(event.target.value as MapStyle)}><option value="grayscale">灰度</option><option value="color">彩色</option></select></label>
        <label>武器<select value={state.weaponId} onChange={(event) => updateWeapon(event.target.value as WeaponId)}><option value="mortar">L81 MORTAR</option><option value="spg">SPH-2</option></select></label>
        {state.weaponId === 'spg' && <label>弹道<select value={state.arc} onChange={(event) => setState((current) => ({ ...current, arc: event.target.value as Arc }))}><option value="high">高弧</option><option value="low">低弧</option></select></label>}
      </div>}
    </section>

    <nav className="map-actions" aria-label="地图操作">
      <button className="icon-button" onClick={undo} disabled={!undoSnapshot} aria-label="撤销"><Undo2 /></button>
      <button className="icon-button" onClick={undoImpact} disabled={!activeTarget?.impacts.length} aria-label="撤销最后落点"><RotateCcw /></button>
      <button className="icon-button" onClick={clearCorrections} disabled={!activeTarget?.impacts.length} aria-label="清空当前目标校射"><Crosshair /></button>
      <button className="icon-button danger" onClick={() => setDeleteConfirm(true)} disabled={!activeTarget} aria-label="删除当前目标"><Trash2 /></button>
      <button className="icon-button" onClick={() => setMapResetKey((value) => value + 1)} aria-label="复位地图"><LocateFixed /></button>
      <button className="icon-button" onClick={toggleFullscreen} aria-label="全屏"><Maximize /></button>
    </nav>

    <nav className="mode-switcher" aria-label="标点模式">
      <ModeButton active={mode === 'gun'} onClick={() => setMode('gun')} icon={<LocateFixed />} label="炮位" />
      <ModeButton active={mode === 'target'} onClick={() => setMode('target')} icon={<TargetIcon />} label="目标" />
      <ModeButton active={mode === 'impact'} onClick={() => setMode('impact')} icon={<Crosshair />} label="落点" />
    </nav>

    <button className="history-tab" onClick={() => setHistoryOpen(true)}><History /> <span>历史</span></button>
    <div className="status-toast">{toast}</div>
    <div className="map-attribution">非官方工具 · Map &amp; Terrain data: wardogs-calculator community project</div>

    {historyOpen && <div className="sheet-backdrop" onPointerDown={() => setHistoryOpen(false)}>
      <aside className="history-sheet" onPointerDown={(event) => event.stopPropagation()} aria-label="目标历史">
        <div className="sheet-header"><div><span className="eyebrow">TARGET LOG</span><h2>目标历史</h2></div><button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="关闭"><X /></button></div>
        <div className="history-tools"><button onClick={downloadHistory}><Download />导出</button><button onClick={() => importInputRef.current?.click()}><Upload />导入</button><input ref={importInputRef} hidden type="file" accept="application/json" onChange={(event) => void importHistory(event.target.files?.[0])} /></div>
        <div className="history-list">{history.length ? history.map((target) => <button key={target.id} className={`history-item ${target.id === state.activeTargetId ? 'active' : ''}`} onClick={() => { if (target.mapId !== state.mapId) updateMap(target.mapId); selectTarget(target.id); setHistoryOpen(false); }}><strong>{target.id}</strong><span>{target.name}</span><small>{MAPS[target.mapId]?.name ?? target.mapId} · {target.impacts.length} 次校射</small></button>) : <div className="empty-state">地图上还没有目标</div>}</div>
        <p className="legal-note">历史仅保存在此浏览器。Terrain3D 仅显示相对高差，不修正射击密位。</p>
      </aside>
    </div>}

    {deleteConfirm && <div className="dialog-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true"><Settings2 /><h2>删除 {activeTarget?.id}？</h2><p>该目标的全部落点和校射记录将一并删除。</p><div><button onClick={() => setDeleteConfirm(false)}>取消</button><button className="confirm-delete" onClick={deleteTarget}>删除目标</button></div></section></div>}
  </main>;
}

function Result({ label, value, unit }: { label: string; value: string; unit: string }) { return <div className="solution-value"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>; }
function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>; }
