import {ImageWindowPanel} from './ImageWindowPanel';
import {TalkingMotionPanel} from './TalkingMotionPanel';
import {reflowCaptionPages} from '../src/build-caption-pages.mjs';
import {CaptionStylePanel} from './CaptionStylePanel';
import {CaptionReviewSave} from './CaptionReviewSave';
import {CaptionTimingEditor} from './CaptionTimingEditor';
import {ClipFocusTools} from './ClipFocusTools';
import {sourceCanvasForClip, type Presentation} from '../src/presentation.mjs';
import React, {useRef, useState} from 'react';
import type {PlayerRef} from '@remotion/player';
import {useEditor} from './store';
import {clipDurationSec} from '../src/timeline';
import {projectCaptions} from '../src/captions';
import {SourceAudition} from './SourceAudition';
import {projectBrolls} from '../src/Broll';
import {IconButton} from './IconButton';

type Tab = '字幕' | '补充画面' | '样式' | '动效' | '音乐';
const TABS: Tab[] = ['字幕', '补充画面', '样式', '动效', '音乐'];
const tabId = (t: Tab) => `inspector-tab-${TABS.indexOf(t)}`;

const ACCENT_SWATCHES = ['#d8f99a', '#FFB020', '#c2c1ff', '#ffb785', '#adc6ff', '#39d98a', '#ff6b8b'];

// Right "属性与字幕" panel: tabbed (Captions / B-roll / Styles / Settings), context-aware.
export const Inspector: React.FC<{
  playerRef: React.RefObject<PlayerRef | null>;
  onGenerate: () => void;
  generating?: boolean;
  progressLabel?: string;
  onGenerateBroll: () => void;
  brollGenerating?: boolean;
  brollLabel?: string;
}> = ({playerRef, onGenerate, generating, progressLabel, onGenerateBroll, brollGenerating, brollLabel}) => {
  const {
    meta, captions, clips, music, brolls, accentColor, selectedId, selectedClipId, presentation, setPresentation,
    select, selectClip, setText, setTopPct, setAllCaptionTopPct, setCaptionHold, toggleAccent, pushHistory,
    deleteClip, moveClip, setMusic, setAccentColor, setBrollMode, swapBroll, removeBroll,
    setClipVolume, toggleClipMute, setClipSpeed,
  } = useEditor();
  const [tab, setTab] = useState<Tab>('字幕');
  const [allCaptionTop, setAllCaptionTop] = useState('');
  const [reflowMessage,setReflowMessage]=useState('');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!meta) return null;

  // WAI-ARIA tabs: ←/→ (Home/End) move between tabs and activate them
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    let next: Tab | null = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation(); // don't move the playhead
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  // captions + b-roll are clip-anchored → project for display (absolute times + order)
  const projCaps = projectCaptions(captions, clips, meta.fps);
  const projBrolls = projectBrolls(brolls, clips, meta.fps);
  const selClip = clips.find((c) => c.id === selectedClipId);
  const seekMs = (ms: number) => playerRef.current?.seekTo(Math.round((ms / 1000) * meta.fps));
  const allCaptionTopValue = allCaptionTop.trim() === '' ? NaN : Number(allCaptionTop);
  const canApplyCaptionTop = Number.isFinite(allCaptionTopValue) && allCaptionTopValue >= 5 && allCaptionTopValue <= 92
    && captions.some(c => c.topPct !== allCaptionTopValue);

  return (
    <aside aria-label="属性与字幕" className="w-80 bg-surface-container-high border-l border-outline-variant flex flex-col h-full shrink-0">
      <div className="p-panel-padding pb-0">
        <h2 className="text-headline-md font-headline-md text-on-surface">属性与字幕</h2>
        <p className="text-body-sm text-on-surface-variant mb-4">选择元素以调整</p>
        <div role="tablist" aria-label="Inspector sections" onKeyDown={onTabKey} className="flex border-b border-outline-variant">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={tabId(t)}
              aria-selected={tab === t}
              aria-controls={`${tabId(t)}-panel`}
              tabIndex={tab === t ? 0 : -1}
              ref={(el) => { tabRefs.current[t] = el; }}
              onClick={() => setTab(t)}
              className={`flex-1 pb-2 text-[10px] font-label-bold uppercase tracking-wide border-b-2 transition-colors ${
                tab === t ? 'border-primary text-on-primary-container' : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`${tabId(tab)}-panel`} aria-labelledby={tabId(tab)} tabIndex={0} className="flex-1 overflow-y-auto p-panel-padding">
        {tab === '字幕' && (
          <>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || !clips.length}
              aria-busy={generating}
              className="w-full py-3 bg-primary-container text-on-primary-container rounded-lg font-bold text-body-md hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${generating ? 'animate-spin' : ''}`}>{generating ? 'progress_activity' : 'auto_awesome'}</span>
              {generating ? '正在生成并校对…' : captions.length ? '重新生成并校对字幕' : '生成中文字幕'}
            </button>
            <button type="button" disabled={generating||!captions.length} onClick={()=>{const next=reflowCaptionPages(captions);if(JSON.stringify(next)===JSON.stringify(captions)){setReflowMessage('分句已是当前结果。');return;}pushHistory();useEditor.getState().setCaptions(next);useEditor.getState().select(null);setReflowMessage(`已整理为 ${next.length} 条字幕，请预览确认。`);}} className="w-full mt-2 py-2 border border-outline-variant/40 rounded text-xs">按意群整理分句 · 可撤销</button>
            {reflowMessage&&<p role="status" className="text-xs mt-1">{reflowMessage}</p>}
            <p className="text-[10px] opacity-70 mt-1">只整理现有文字与原词时间，不重识别、不改原声；已校正时间的字幕保持原样。</p>
            {generating && <p className="text-[11px] text-on-surface-variant mt-2 mb-3 truncate">{progressLabel}</p>}
            <div className="mb-5" />

            <section aria-labelledby="all-caption-top-label" className="mb-5 p-3 rounded-lg border border-outline-variant/40">
              <label id="all-caption-top-label" htmlFor="all-caption-top" className="text-[11px] text-on-surface-variant">全部字幕垂直位置（%）</label>
              <input
                id="all-caption-top"
                type="number" min={5} max={92} step="any" value={allCaptionTop}
                onChange={e => setAllCaptionTop(e.target.value)}
                className="w-full my-2 rounded p-2 bg-surface-container-lowest border border-outline-variant/40"
              />
              <button type="button" disabled={!canApplyCaptionTop}
                onClick={() => { if (canApplyCaptionTop) setAllCaptionTopPct(allCaptionTopValue); }}
                className="w-full py-2 rounded border border-outline-variant/40 text-[11px] disabled:opacity-40">
                应用到全部字幕 · 一次撤销
              </button>
              <p className="text-[10px] text-on-surface-variant mt-2">5—92%；点击应用后生效，仅调整字幕位置。</p>
            </section>

            {/* selected clip card */}
            {selClip && (
              <section aria-labelledby="clip-card-heading" className="mb-5 p-3 rounded-lg bg-surface-variant/40 border border-primary/30">
                <div className="flex justify-between items-center mb-2">
                  <h3 id="clip-card-heading" className="text-label-bold font-label-bold uppercase text-primary">原片</h3>
                  <div className="flex gap-1">
                    <IconButton icon="chevron_left" label="前移片段" onClick={() => moveClip(selClip.id, -1)} className="text-on-surface-variant hover:text-on-surface" />
                    <IconButton icon="chevron_right" label="后移片段" onClick={() => moveClip(selClip.id, 1)} className="text-on-surface-variant hover:text-on-surface" />
                    <IconButton icon="delete" label="删除片段" onClick={() => { deleteClip(selClip.id); selectClip(null); }} className="text-on-surface-variant hover:text-error" />
                  </div>
                </div>
                <p className="text-body-sm text-on-surface truncate mb-2">{selClip.label ?? selClip.id}</p>
                <dl>
                  <Row k="起点" v={`${selClip.inSec.toFixed(2)}s`} />
                  <Row k="终点" v={`${selClip.outSec.toFixed(2)}s`} />
                  <Row k="时长" v={`${clipDurationSec(selClip).toFixed(2)}s`} />
                </dl>

                {/* playback speed */}
                <label htmlFor="clip-speed" className="text-[11px] text-on-surface-variant block mt-3">成片速度：{(selClip.speed ?? 1).toFixed(2)}×</label>
                <div role="group" aria-label="成片速度预设" className="flex items-center gap-1 mt-1">
                  {[0.5, 1, 1.5, 2].map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      aria-pressed={Math.abs((selClip.speed ?? 1) - sp) < 0.01}
                      onClick={() => { pushHistory(); setClipSpeed(selClip.id, sp); }}
                      className={`flex-1 py-1 text-[11px] rounded border ${
                        Math.abs((selClip.speed ?? 1) - sp) < 0.01 ? 'border-primary text-primary bg-primary-container/20' : 'border-outline-variant/40 text-on-surface-variant'
                      }`}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
                <input
                  id="clip-speed"
                  aria-label="所选片段成片速度"
                  type="range" min={25} max={400} step={5} value={Math.round((selClip.speed ?? 1) * 100)}
                  aria-valuetext={`${(selClip.speed ?? 1).toFixed(2)}×`}
                  onPointerDown={pushHistory}
                  onChange={(e) => setClipSpeed(selClip.id, Number(e.target.value) / 100)}
                  className="w-full mt-1 accent-primary"
                />
                <p className="text-[10px] text-on-surface-variant mt-1">0.25—4×，调整所选片段并用于导出；字幕与画面动效跟随变化。</p>
                <label className="block text-[11px] mt-3">成片画幅<select aria-label="所选原片成片画幅"
                  value={presentation.format} className="w-full mt-1 px-2 py-1 rounded bg-surface-container-lowest"
                  onChange={e => {
                    const format = e.target.value as Presentation['format'];
                    if (format === 'source') {
                      const canvas = sourceCanvasForClip(selClip);
                      if (canvas) setPresentation({...presentation, format, canvas});
                    } else setPresentation({...presentation, format, canvas: undefined});
                  }}>
                  <option value="landscape">16:9 横屏</option><option value="portrait">9:16 竖屏</option>
                  <option value="source" disabled={!sourceCanvasForClip(selClip)}>原片比例{sourceCanvasForClip(selClip) ? ` · ${sourceCanvasForClip(selClip)!.width}×1080` : ''}</option>
                </select></label>
                <ClipFocusTools key={selClip.id} clip={selClip} onChange={patch => {
                  pushHistory();
                  useEditor.setState(state => ({clips: state.clips.map(clip => clip.id === selClip.id ? {...clip, ...patch} : clip)}));
                }} />

                {/* clip audio */}
                <div className="flex items-center justify-between mt-3 mb-1">
                  <label htmlFor="clip-volume" className="text-[11px] text-on-surface-variant">
                    音量：{selClip.muted ? 'muted' : `${Math.round((selClip.volume ?? 1) * 100)}%`}
                  </label>
                  <IconButton
                    icon={selClip.muted ? 'volume_off' : 'volume_up'}
                    label={selClip.muted ? 'Unmute clip' : 'Mute clip'}
                    pressed={!!selClip.muted}
                    onClick={() => toggleClipMute(selClip.id)}
                    className={selClip.muted ? 'text-error' : 'text-on-surface-variant hover:text-on-surface'}
                  />
                </div>
                <input
                  id="clip-volume"
                  type="range" min={0} max={200} value={Math.round((selClip.volume ?? 1) * 100)}
                  aria-valuetext={`${Math.round((selClip.volume ?? 1) * 100)}%`}
                  disabled={selClip.muted}
                  onPointerDown={pushHistory}
                  onChange={(e) => setClipVolume(selClip.id, Number(e.target.value) / 100)}
                  className="w-full accent-primary disabled:opacity-40"
                />
                <p className="text-[11px] text-on-surface-variant/75 mt-2">拖动时间轴片段两端，可调整起止位置。</p>
              </section>
            )}

            {/* caption cards */}
            {!captions.length ? (
              <p className="text-body-sm text-on-surface-variant/75">
                暂无字幕。先粗剪，再点击 <span className="text-primary">生成中文字幕</span>.
              </p>
            ) : (
              <ul aria-label="字幕" className="space-y-2 list-none m-0 p-0">
                {projCaps.map((c) => {
                  const sel = c.id === selectedId;
                  const text = c.words.map((w) => w.text).join(c.words.some(w=>/[\u3400-\u9fff]/.test(w.text))?'':' ');
                  const pick = () => { select(c.id); seekMs(c.startMs + 20); };
                  return (
                    // the whole card is mouse-clickable; the keyboard target is the
                    // time-range button (a card can't be a button — it holds a textarea)
                    <li
                      key={c.id}
                      onClick={pick}
                      className={`p-3 rounded cursor-pointer transition-colors relative ${
                        sel ? 'bg-surface-variant/40 border-2 border-primary' : 'bg-surface-variant/20 border border-outline-variant/30 hover:border-primary/30'
                      }`}
                    >
                      {sel && <div aria-hidden="true" className="absolute -left-[1px] top-0 bottom-0 w-1 bg-primary rounded-l" />}
                      <div className="flex justify-between items-center mb-1">
                        <button
                          type="button"
                          aria-pressed={sel}
                          aria-label={`Caption ${(c.startMs / 1000).toFixed(2)} to ${(c.endMs / 1000).toFixed(2)} seconds: ${text}`}
                          onClick={(e) => { e.stopPropagation(); pick(); }}
                          className={`text-[10px] font-mono ${sel ? 'text-primary' : 'text-on-surface-variant'}`}
                        >
                          {(c.startMs / 1000).toFixed(2)}s – {(c.endMs / 1000).toFixed(2)}s
                        </button>
                      </div>

                      {sel ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          {(()=>{const original=captions.find(cap=>cap.id===c.id),clip=clips.find(clip=>clip.id===original?.clipId);return original&&clip?<SourceAudition key={c.id} src={clip.src} startMs={original.startMs} endMs={original.endMs} onPlay={()=>playerRef.current?.pause()}/>:null;})()}
                          <textarea
                            aria-label="字幕文字"
                            value={text}
                            onFocus={pushHistory}
                            onChange={(e) => setText(c.id, e.target.value)}
                            rows={2}
                            className="w-full mt-1 mb-3 bg-surface-container-lowest text-on-surface border border-outline-variant/40 focus:border-primary rounded p-2 text-body-md resize-y"
                          />
                          {(()=>{const original=captions.find(cap=>cap.id===c.id),clip=clips.find(clip=>clip.id===original?.clipId);return original&&clip?<><CaptionReviewSave key={c.id} caption={original} src={clip.src}/><CaptionTimingEditor key={'timing-'+c.id} caption={original} src={clip.src}/></>:null;})()}
                          <label htmlFor="caption-top" className="text-[11px] text-on-surface-variant">垂直位置： {c.styleOverride?.topPct??presentation.captionStyle?.topPct??c.topPct}%</label>
                          <input
                            id="caption-top"
                            type="range" min={5} max={92} value={c.styleOverride?.topPct??presentation.captionStyle?.topPct??c.topPct}
                            aria-valuetext={`${c.topPct}% from the top`}
                            onPointerDown={pushHistory}
                            onKeyDown={(e) => {if(!e.repeat&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))pushHistory();}}
                            onChange={(e) => setTopPct(c.id, Number(e.target.value))}
                            className="w-full mt-1 mb-3 accent-primary"
                          />
                          <label className="text-[11px] text-on-surface-variant">句末延留（毫秒）<input type="number" min="0" max="1000" step="20" aria-label="字幕句末延留毫秒" disabled={c.timingScope==='cue'} value={c.holdMs??700} onFocus={pushHistory} onChange={e=>setCaptionHold(c.id,Number(e.target.value))}/></label>
                          {c.timingScope==='cue'&&<p className="text-[11px] text-on-surface-variant">已校正整句时间，退场由上方整句结束时间控制。</p>}
                          <p id="accent-words-label" className="text-[11px] text-on-surface-variant">重点词（点击切换）</p>
                          <div role="group" aria-labelledby="accent-words-label" className="flex flex-wrap gap-1.5 mt-1.5">
                            {c.words.map((w, i) => (
                              <button
                                key={i}
                                type="button"
                                aria-pressed={!!w.accent}
                                onClick={() => { pushHistory(); toggleAccent(c.id, i); }}
                                style={w.accent ? {background: accentColor, borderColor: accentColor, color: '#000'} : undefined}
                                className={`px-2 py-1 rounded text-[12px] border ${
                                  w.accent ? 'font-bold' : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant'
                                }`}
                              >
                                {w.text}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-body-sm text-on-surface-variant truncate">{text}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === '补充画面' && (
          <>
            <button
              type="button"
              onClick={onGenerateBroll}
              disabled={brollGenerating || !clips.length}
              aria-busy={brollGenerating}
              className="w-full py-3 bg-primary-container text-on-primary-container rounded-lg font-bold text-body-md hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${brollGenerating ? 'animate-spin' : ''}`}>{brollGenerating ? 'progress_activity' : 'movie'}</span>
              {brollGenerating ? 'Finding B-roll…' : '自动配素材'}
            </button>
            {brollGenerating && <p className="text-[11px] text-on-surface-variant mt-2 truncate">{brollLabel}</p>}
            <div className="mb-5" />

            {!brolls.length ? (
              <p className="text-body-sm text-on-surface-variant/75">
                暂无补充画面。先生成字幕，再点击 <span className="text-primary">自动配素材</span>，按内容匹配画面。
              </p>
            ) : (
              <ul aria-label="B-roll cues" className="space-y-2 list-none m-0 p-0">
                {projBrolls.map((b) => {
                  const isSel = b.id === selectedId;
                  const pick = () => { select(b.id); seekMs(b.startMs + 20); };
                  return (
                    <li
                      key={b.id}
                      onClick={pick}
                      className={`p-3 rounded cursor-pointer transition-colors ${isSel ? 'bg-surface-variant/40 border-2 border-primary' : 'bg-surface-variant/20 border border-outline-variant/30 hover:border-primary/30'}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <button
                          type="button"
                          aria-pressed={isSel}
                          aria-label={`B-roll at ${(b.startMs / 1000).toFixed(1)} seconds: ${b.query ?? b.id}`}
                          onClick={(e) => { e.stopPropagation(); pick(); }}
                          className="text-[10px] font-mono text-on-surface-variant"
                        >
                          {(b.startMs / 1000).toFixed(1)}s
                        </button>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${b.source === 'own' ? 'bg-secondary-container/40 text-secondary' : 'bg-tertiary-container/40 text-tertiary'}`}>{b.source ?? 'pexels'}</span>
                      </div>
                      <p className="text-body-sm text-on-surface truncate mb-2">{b.query ?? b.id}</p>
                      <div role="group" aria-label="Placement" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        {(['fullscreen', 'top', 'inset'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={b.mode === m}
                            onClick={() => setBrollMode(b.id, m)}
                            className={`flex-1 py-1 text-[10px] rounded border ${b.mode === m ? 'border-primary text-primary bg-primary-container/20' : 'border-outline-variant/40 text-on-surface-variant'}`}
                          >
                            {m === 'fullscreen' ? 'Full' : m === 'top' ? 'Top' : 'Inset'}
                          </button>
                        ))}
                        {!!b.alternatives?.length && (
                          <IconButton icon="cached" label="切换备选素材" onClick={() => swapBroll(b.id)} className="text-on-surface-variant hover:text-primary px-1" />
                        )}
                        <IconButton icon="delete" label="移除补充画面" onClick={() => removeBroll(b.id)} className="text-on-surface-variant hover:text-error px-1" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === '样式' && (
          <div>
            <CaptionStylePanel/>
            <p id="accent-color-label" className="text-label-bold font-label-bold uppercase text-on-surface-variant">强调色</p>
            <div role="group" aria-labelledby="accent-color-label" className="flex flex-wrap gap-2 mt-3">
              {ACCENT_SWATCHES.map((c) => {
                const on = accentColor.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Accent color ${c}`}
                    aria-pressed={on}
                    onClick={() => presentation.captionStyle?setPresentation({...presentation,captionStyle:{...presentation.captionStyle,accentColor:c}}):setAccentColor(c)}
                    style={{background: c}}
                    className={`w-8 h-8 rounded-full border-2 ${on ? 'border-on-surface' : 'border-transparent'}`}
                    title={c}
                  />
                );
              })}
            </div>
            <p className="text-[11px] text-on-surface-variant/75 mt-3">突出字幕中的重点词。</p>
          </div>
        )}

        {tab === '动效' && <><ImageWindowPanel playerRef={playerRef}/><TalkingMotionPanel playerRef={playerRef}/></>}
        {tab === '音乐' && (
          <div className="space-y-5">
            <section aria-labelledby="music-heading">
              <h3 id="music-heading" className="text-label-bold font-label-bold uppercase text-on-surface-variant">音乐</h3>
              {music ? (
                <>
                  <p className="text-body-sm text-on-surface truncate mt-2 mb-3">{music.src.split('/').pop()}</p>
                  <label htmlFor="music-volume" className="text-[11px] text-on-surface-variant">音量：{Math.round(music.volume * 100)}%</label>
                  <input
                    id="music-volume"
                    type="range" min={0} max={100} value={Math.round(music.volume * 100)}
                    aria-valuetext={`${Math.round(music.volume * 100)}%`}
                    onChange={(e) => setMusic({...music, volume: Number(e.target.value) / 100})}
                    className="w-full mt-1 mb-3 accent-primary"
                  />
                  <label htmlFor="music-fade" className="text-[11px] text-on-surface-variant">Fade-out: {music.fadeOutSec.toFixed(1)}s</label>
                  <input
                    id="music-fade"
                    type="range" min={0} max={50} value={Math.round(music.fadeOutSec * 10)}
                    aria-valuetext={`${music.fadeOutSec.toFixed(1)} seconds`}
                    onChange={(e) => setMusic({...music, fadeOutSec: Number(e.target.value) / 10})}
                    className="w-full mt-1 accent-primary"
                  />

                  {/* auto-duck under voice */}
                  <div className="flex items-center justify-between mt-4">
                    <span id="duck-label" className="text-[11px] text-on-surface-variant">人声出现时压低音乐</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!music.duck}
                      aria-labelledby="duck-label"
                      onClick={() => setMusic({...music, duck: !music.duck})}
                      title="Automatically lower the music while someone is speaking"
                      className={`w-9 h-5 rounded-full relative transition-colors ${music.duck ? 'bg-primary-container' : 'bg-surface-container-lowest border border-outline-variant/50'}`}
                    >
                      <span aria-hidden="true" className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${music.duck ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {music.duck && (
                    <>
                      <label htmlFor="music-duck-level" className="text-[11px] text-on-surface-variant">Ducked level: {Math.round((music.duckLevel ?? 0.25) * 100)}%</label>
                      <input
                        id="music-duck-level"
                        type="range" min={5} max={80} value={Math.round((music.duckLevel ?? 0.25) * 100)}
                        aria-valuetext={`${Math.round((music.duckLevel ?? 0.25) * 100)}%`}
                        onChange={(e) => setMusic({...music, duckLevel: Number(e.target.value) / 100})}
                        className="w-full mt-1 accent-primary"
                      />
                      <p className="text-[10px] text-on-surface-variant/75 mt-1">依据字幕范围压低音乐，请先生成字幕。</p>
                    </>
                  )}
                </>
              ) : (
                <p className="text-body-sm text-on-surface-variant/75 mt-2">暂无背景音乐，请从素材库添加。</p>
              )}
            </section>
            <dl className="pt-4 border-t border-outline-variant/30">
              <Row k="Resolution" v={`${meta.width}×${meta.height}`} />
              <Row k="FPS" v={String(meta.fps)} />
              <Row k="Clips" v={String(clips.length)} />
              <Row k="时长" v={`${(meta.durationInFrames / meta.fps).toFixed(1)}s`} />
            </dl>
          </div>
        )}
      </div>
    </aside>
  );
};

const Row: React.FC<{k: string; v: string}> = ({k, v}) => (
  <div className="flex justify-between py-1 text-body-sm border-b border-outline-variant/15">
    <dt className="text-on-surface-variant">{k}</dt>
    <dd className="text-on-surface font-mono m-0">{v}</dd>
  </div>
);
