import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {loadMotionReviewFixtures, type MotionReviewFixtureCatalog} from './motion-review-fixtures.mjs';
import {createMotionReviewCatalog, type MotionReviewCatalogRow, type MotionReviewFeedback, type MotionReviewReferenceManifest} from './motion-review-catalog.mjs';
import {MotionReviewPreview, type MotionReviewPlaybackCommand, type MotionReviewPlaybackState, type MotionReviewPreviewReadiness} from './MotionReviewPreview';
import './motion-review.css';

const STORAGE_KEY = 'saymivo.motion-review.feedback.v1';
const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const needsRework = (row: MotionReviewCatalogRow) => !row.feedback.stale && row.feedback.currentStatus === 'rework';
function readFeedback(): Record<string, MotionReviewFeedback> {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
type ReferenceState = {entryId: string; identity: string; loaded: boolean; playing: boolean; error: string; currentTime: number};
type ReferenceClip = MotionReviewCatalogRow['referenceClips'][number];
const referenceIdentity = (row: MotionReviewCatalogRow) => JSON.stringify([row.entryId, row.referenceClips.map(clip => [clip.src, clip.sha256, clip.startSec, clip.endSec])]);

function OriginalReference({row, command, onState}: {row: MotionReviewCatalogRow; command?: MotionReviewPlaybackCommand; onState: (state: ReferenceState) => void}) {
  const video = useRef<HTMLVideoElement>(null), received = useRef<number | null>(null);
  const [clipIndex, setClipIndex] = useState(0), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [loop, setLoop] = useState(true), [rate, setRate] = useState(1);
  const clip: ReferenceClip | undefined = row.referenceClips[clipIndex];
  const identity = referenceIdentity(row), src = clip ? '/' + clip.src + '?v=' + clip.sha256 : '';
  useEffect(() => { const element = video.current; setLoaded(false); setError(''); setTime(0); setPlaying(false); return () => { element?.pause(); }; }, [src]);
  useEffect(() => onState({entryId: row.entryId, identity, loaded, playing, error, currentTime: time}), [row.entryId, identity, loaded, playing, error, time, onState]);
  const play = useCallback(async (replay = false) => {
    const element = video.current; if (!element) return;
    if (replay) element.currentTime = 0;
    try { await element.play(); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '参考播放器未能启动，请点击原片播放按钮。'); }
  }, []);
  useEffect(() => {
    if (!command || command.id === received.current || !clip) return;
    received.current = command.id;
    const element = video.current; if (!element) return;
    if (command.rate !== undefined) { element.playbackRate = command.rate; setRate(command.rate); }
    if (command.action === 'pause') element.pause(); else void play(command.action === 'replay');
  }, [command?.id, command?.action, command?.rate, clip, play]);
  const officialUrl = String(clip?.officialUrl || row.reference?.officialUrl || '');
  return <section className="review-reference" aria-label="柱子哥对应原片">
    <div className="review-pane-caption"><strong>柱子哥对应原片</strong><span className={loaded ? 'review-ready' : ''}>{error ? '播放受阻' : loaded ? '真实视频已载入' : clip ? '读取真实片段' : '参考待补'}</span></div>
    {clip ? <>
      <div className="review-video-stage"><video key={src} ref={video} src={encodeURI(src)} controls muted playsInline preload="auto" loop={loop}
        onLoadedData={() => { setLoaded(true); if (video.current) video.current.playbackRate = rate; }} onError={() => { setError('本地原片片段未能解码，请重新载入参考。'); setLoaded(false); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setTime(video.current?.currentTime ?? 0)} /></div>
      <div className="review-local-controls"><button type="button" onClick={() => playing ? video.current?.pause() : void play()}>{playing ? '暂停原片' : '播放原片'}</button><button type="button" onClick={() => void play(true)}>重播原片</button><label><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} />循环</label><label>速度<select aria-label="原片播放速度" value={rate} onChange={event => { const value = Number(event.target.value); setRate(value); if (video.current) video.current.playbackRate = value; }}><option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option></select></label></div>
      {row.referenceClips.length > 1 && <label className="review-clip-picker">对应片段<select aria-label="选择对应原片片段" value={clipIndex} onChange={event => { video.current?.pause(); setClipIndex(Number(event.target.value)); }}>
        {row.referenceClips.map((item, i) => <option key={item.src + i} value={i}>片段 {i + 1} · {clock(item.startSec)}–{clock(item.endSec)}</option>)}
      </select></label>}
      <p className="review-media-note">第 {String(clip.episode ?? '')} 条 · 原片 {clock(clip.startSec)}–{clock(clip.endSec)} · 当前原片时刻 {clock(clip.startSec + time)}</p>
      <p className="review-media-note">保留动作前后画面；本地片段从 00:00 播放。默认静音，可用播放器音量控件试听。</p>
    </> : <div className="review-empty">对应原片片段尚未准备好。这里不会用截图拼接回放代替原视频。</div>}
    {!!error && <p className="review-error" role="alert">{error}</p>}
    {!!officialUrl && <a className="review-source-link" href={officialUrl} target="_blank" rel="noreferrer">打开官方原视频 ↗</a>}
  </section>;
}

export function MotionReviewPage() {
  const [fixtures, setFixtures] = useState<MotionReviewFixtureCatalog>(), [manifest, setManifest] = useState<MotionReviewReferenceManifest>(), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('effect') || 'evidence-handoff');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [view, setView] = useState<'split' | 'ours' | 'reference'>('split'), [sidebar, setSidebar] = useState(() => window.innerWidth >= 1000);
  const [feedback, setFeedback] = useState<Record<string, MotionReviewFeedback>>(readFeedback), [storageError, setStorageError] = useState('');
  const [command, setCommand] = useState<MotionReviewPlaybackCommand>(), commandId = useRef(0);
  const [pairedRate, setPairedRate] = useState(1);
  const [reports, setReports] = useState<Record<string, MotionReviewPreviewReadiness>>({}), [playback, setPlayback] = useState<MotionReviewPlaybackState>(), [referenceState, setReferenceState] = useState<ReferenceState>();
  const loadReferences = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/motion-review/reference-manifest.json', {cache: 'no-store', signal});
    if (!response.ok) throw Error('原片清单尚未读到，请确认参考文件已准备好。');
    const value = await response.json(); if (!Array.isArray(value.entries)) throw Error('原片清单格式不完整。'); setManifest(value);
  }, []);
  useEffect(() => {
    document.title = '动效逐项验收 · Saymivo'; const controller = new AbortController();
    void Promise.allSettled([loadMotionReviewFixtures({signal: controller.signal}), loadReferences(controller.signal)]).then(results => {
      if (controller.signal.aborted) return;
      const issues: string[] = [];
      if (results[0].status === 'fulfilled') setFixtures(results[0].value); else issues.push(String(results[0].reason));
      if (results[1].status === 'rejected') issues.push(String(results[1].reason)); setLoadError(issues.join('；')); setLoading(false);
    }); return () => controller.abort();
  }, [loadReferences]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(feedback)); setStorageError(''); } catch { setStorageError('当前浏览器没有保存本地验收记录，请保留页面。'); } }, [feedback]);
  const catalog = useMemo(() => createMotionReviewCatalog(fixtures, manifest, {feedbackByEntryId: feedback}), [fixtures, manifest, feedback]);
  const rows = catalog.rows, selected = rows.find(row => row.entryId === selectedId) || rows[0];
  const filtered = rows.filter(row => (!query || (row.name + row.entryId + row.differenceBrief).toLowerCase().includes(query.toLowerCase())) && (filter === 'all' || filter === 'accepted' && row.accepted || filter === 'pending' && !row.accepted && row.fixtureReady || filter === 'unavailable' && !row.fixtureReady || filter === 'rework' && needsRework(row)));
  const currentReport = selected && reports[selected.entryId], currentPlayback = playback?.entryId === selected?.entryId ? playback : undefined, currentReference = selected && referenceState?.entryId === selected.entryId && referenceState.identity === referenceIdentity(selected) ? referenceState : undefined;
  const onReadiness = useCallback((report: MotionReviewPreviewReadiness) => setReports(previous => JSON.stringify(previous[report.entryId]) === JSON.stringify(report) ? previous : {...previous, [report.entryId]: report}), []);
  const onPlayback = useCallback((state: MotionReviewPlaybackState) => setPlayback(state), []), onReference = useCallback((state: ReferenceState) => setReferenceState(state), []);
  const select = (id: string) => { setCommand(undefined); setPairedRate(1); setSelectedId(id); setPlayback(undefined); setReferenceState(undefined); if (window.innerWidth < 1000) setSidebar(false); const url = new URL(location.href); url.searchParams.set('effect', id); history.replaceState(null, '', url); };
  const send = (action: MotionReviewPlaybackCommand['action'], rate?: number) => setCommand({id: ++commandId.current, action, ...(rate === undefined ? {} : {rate})});
  useEffect(() => { const pauseWhenHidden = () => { if (document.hidden) setCommand({id: ++commandId.current, action: 'pause'}); }; document.addEventListener('visibilitychange', pauseWhenHidden); return () => document.removeEventListener('visibilitychange', pauseWhenHidden); }, []);
  const saveFeedback = (status: MotionReviewFeedback['status'], note = selected?.feedback.note || '') => { if (!selected?.fingerprint) return; setFeedback(previous => ({...previous, [selected.entryId]: {status, fingerprint: selected.fingerprint!, note}})); };
  const move = (offset: number) => { const index = rows.findIndex(row => row.entryId === selected?.entryId); const row = rows[index + offset]; if (row) select(row.entryId); };
  const label = (row: MotionReviewCatalogRow) => row.accepted ? '已完成 · 你已通过' : !row.fixtureReady || reports[row.entryId]?.status === 'blocked' ? needsRework(row) ? '未完成 · 需返工' : '未完成' : needsRework(row) ? '部分完成 · 需返工' : '部分完成 · 待验收';
  const actualBlocked = currentReport?.status === 'blocked' || currentReport?.status === 'unavailable';
  const missing = selected ? [...new Set([...selected.missing, ...(actualBlocked ? currentReport?.issues || [] : []), ...(currentReference?.error ? [currentReference.error] : [])])] : [];
  return <div className={`motion-review-shell ${sidebar ? '' : 'review-sidebar-hidden'}`}>
    <header className="review-header"><a href="/" target="_blank" rel="noreferrer" className="review-brand">S<span>Saymivo</span></a><div className="review-header-title"><strong>动效逐项验收</strong><span>实际播放 · 原片对照 · 差距记录</span></div><span className="review-pause-chip">成片剪辑已暂停</span><button type="button" onClick={() => setSidebar(value => !value)}>{sidebar ? '收起目录' : '展开目录'}</button></header>
    <aside className="review-sidebar"><div className="review-sidebar-heading"><h1>现有动效</h1><span>{rows.length} 项</span></div><label className="review-search"><span>搜索动效</span><input aria-label="搜索动效" placeholder="名称、用途或差距…" value={query} onChange={event => setQuery(event.target.value)} /></label><select className="review-filter" aria-label="筛选验收状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部状态</option><option value="pending">可预览，待验收</option><option value="unavailable">示例待补</option><option value="rework">需要返工</option><option value="accepted">你已通过</option></select><nav aria-label="逐项动效目录">{filtered.map((row) => <button type="button" key={row.entryId} aria-current={selected?.entryId === row.entryId ? 'true' : undefined} onClick={() => select(row.entryId)} className={selected?.entryId === row.entryId ? 'selected' : ''}><span className="review-list-number">{String(rows.indexOf(row) + 1).padStart(2, '0')}</span><span className="review-list-text"><strong>{row.name}</strong><small className={row.accepted ? 'review-ready' : !row.fixtureReady ? 'review-warning' : ''}>{label(row)}</small></span></button>)}</nav>{!filtered.length && <p className="review-media-note">没有符合条件的项目。</p>}<p className="review-sidebar-foot">“已完成”只来自你的明确验收。代码存在、当前帧就绪和其他动效通过都不会自动算完成。</p></aside>
    <main className="review-main">
      <div className="review-summary"><span>共 <b>{catalog.summary.total}</b> 项</span><span>对照材料齐 <b>{catalog.summary.reviewable}</b></span><span>示例待补 <b>{catalog.summary.demoUnavailable}</b></span><span>你已通过 <b>{catalog.summary.accepted}</b></span><button type="button" onClick={() => void loadReferences().then(() => setLoadError('')).catch(error => setLoadError(String(error)))}>重新读取参考</button></div>
      {loading && <div className="review-loading" role="status">正在读取本地动效、真实素材和原片片段…</div>}
      {!!loadError && <p className="review-error" role="alert">{loadError}</p>}
      {!!storageError && <p className="review-error" role="alert">{storageError}</p>}
      {selected && <>
        <div className="review-item-heading"><div><p className="review-eyebrow">第 {rows.indexOf(selected) + 1} 项 / 共 {rows.length} 项</p><h2>{selected.name}</h2></div><div className="review-item-choices"><select aria-label="选择动效" value={selected.entryId} onChange={event => select(event.target.value)}>{rows.map((row, index) => <option key={row.entryId} value={row.entryId}>{String(index + 1).padStart(2, '0')} · {row.name}</option>)}</select><span className={`review-item-status ${selected.accepted ? 'accepted' : !selected.fixtureReady || actualBlocked ? 'blocked' : ''}`}>{label(selected)}</span></div></div>
        <div className="review-toolbar"><div className="review-transport"><button type="button" className="review-primary" disabled={!selected.fixtureReady && !selected.referenceReady} onClick={() => send('replay')}>↻ 同时重播</button><button type="button" onClick={() => send('pause')}>暂停两边</button><label>一起慢放<select aria-label="两边一起播放速度" value={pairedRate} onChange={event => { const rate = Number(event.target.value); setPairedRate(rate); send('play', rate); }}><option value="1">1×</option><option value="0.75">0.75×</option><option value="0.5">0.5×</option></select></label></div><div className="review-view-switch" role="group" aria-label="预览布局"><button type="button" aria-pressed={view === 'split'} onClick={() => setView('split')}>并排</button><button type="button" aria-pressed={view === 'ours'} onClick={() => setView('ours')}>放大我们的</button><button type="button" aria-pressed={view === 'reference'} onClick={() => setView('reference')}>放大原片</button></div></div>
        <div className={`review-players review-view-${view}`}>
          <div className="review-pane review-ours-pane"><div className="review-pane-label"><span>我们的现有实现</span><span>真实组件实时播放</span></div><MotionReviewPreview key={selected.entryId} fixture={selected.fixture} command={command} onReadiness={onReadiness} onPlaybackState={onPlayback}/><div className="review-playback-observation" data-review-observation={selected.entryId} data-frame={currentPlayback?.frame ?? ''} data-playing={String(currentPlayback?.playing ?? false)} data-native-status={currentReport?.status || 'loading'}>{currentPlayback?.frame !== null && currentPlayback?.frame !== undefined ? `实际播放 ${((currentPlayback.currentTimeSec ?? 0)).toFixed(1)}s · 第 ${currentPlayback.frame} 帧${currentPlayback.waiting ? ' · 缓冲中' : ''}` : '等待实际播放器挂载'}</div></div>
          <div className="review-pane review-original-pane"><div className="review-pane-label"><span>柱子哥原片</span><span>真实截取 · 含动作前后</span></div><OriginalReference key={referenceIdentity(selected)} row={selected} command={command} onState={onReference}/></div>
        </div>
        <p className="review-comparison-note">两边从各自片段起点开始，时长和动作节奏可能不同。左侧为原创示例，真人原声与示意文字没有语义对应；本页默认静音，只用于验收现有动态效果。</p>
        <div className="review-details"><section><h3>与参考还差什么</h3><p>{selected.differenceBrief || '对应差异尚未整理，暂不能认定复现完成。'}</p>{selected.comparisonRelation === 'related-only' && <p className="review-warning">这里只覆盖相关基础表达，不能按参考的完整组合验收为等价。</p>}</section><section><h3>实现和材料状态</h3><ul><li><span className={selected.fixtureReady ? 'review-ready' : 'review-warning'}>{selected.fixtureReady ? '●' : '○'}</span> 原创示例{selected.fixtureReady ? '已配置，需实际观看' : '尚未就绪'}</li><li><span className={selected.referenceReady ? 'review-ready' : 'review-warning'}>{selected.referenceReady ? '●' : '○'}</span> 对应真实原片{selected.referenceReady ? `已备 ${selected.referenceClips.length} 段` : '待补'}</li><li><span className={selected.accepted ? 'review-ready' : ''}>{selected.accepted ? '●' : '○'}</span> 你的验收：{selected.accepted ? '已通过' : needsRework(selected) ? '需要返工' : '待验收'}</li></ul>{missing.length > 0 && <ul className="review-missing">{missing.map(issue => <li key={issue}>{issue}</li>)}</ul>}</section></div>
        <section className="review-feedback" aria-label="本项验收结论"><div><h3>看完后，记录这一项</h3><p>结论只保存在本机浏览器。实现或参考片段改变后，旧“通过”会失效。</p>{selected.feedback.stale && <p className="review-warning">示例或参考已变化，请重新验收；原备注保留。</p>}</div><textarea aria-label="本项验收备注" placeholder="例如：资料放大太慢、人物挡住文字、退场还不顺…" value={selected.feedback.note} onChange={event => saveFeedback(selected.feedback.stale ? 'pending' : selected.feedback.currentStatus, event.target.value)} /><div className="review-feedback-actions"><button type="button" className={selected.accepted ? 'review-primary' : ''} disabled={!selected.comparisonReady || !currentReference?.loaded || currentReport?.status !== 'ready'} onClick={() => saveFeedback('accepted')}>✓ 通过本项</button><button type="button" className={needsRework(selected) ? 'review-rework' : ''} onClick={() => saveFeedback('rework')}>需要返工</button><button type="button" onClick={() => saveFeedback('pending')}>保持待验收</button><span>只有你点击“通过本项”才标完成。</span></div></section>
        <footer className="review-bottom"><button type="button" disabled={rows.indexOf(selected) === 0} onClick={() => move(-1)}>← 上一项</button><span>{rows.indexOf(selected) + 1} / {rows.length}</span><button type="button" disabled={rows.indexOf(selected) === rows.length - 1} onClick={() => move(1)}>下一项 →</button></footer>
      </>}
    </main>
  </div>;
}
