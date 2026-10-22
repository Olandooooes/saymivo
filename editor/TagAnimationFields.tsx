import React from 'react';
import type {SceneTag} from '../src/storyboard.mjs';

export function TagAnimationFields({tag, kinetic, onChange, onLineTimingsChange, onContextTimingChange}: {
  tag: SceneTag;
  kinetic: boolean;
  onChange: (animation: SceneTag['animation']) => void;
  onLineTimingsChange: (lineAtMs: SceneTag['lineAtMs']) => void;
  onContextTimingChange?: (contextAtMs: SceneTag['contextAtMs']) => void;
}) {
  const multiline = kinetic && tag.text.includes('\n');
  const lines = tag.text.split('\n');
  const latestContextMs = Math.max(tag.atMs, Math.ceil(tag.endMs) - 1);
  const defaultLineTimes = lines.map((_, index) => tag.atMs + (tag.endMs - tag.atMs) * .4 * index / Math.max(1, lines.length - 1));
  const fields = [
    {key: 'inMs', label: '标签入场用时', max: 2000, fallback: kinetic ? 380 : 280},
    {key: 'outMs', label: '标签退场用时', max: 2000, fallback: kinetic ? 260 : 200},
    {key: 'lineDelayMs', label: '逐行间隔', max: 500, fallback: 85},
  ] as const;
  return <details>
    <summary>标签入场与退场动画</summary>
    <p className="muted">0表示直接显示或消失；短窗口会自动缩短动画，出现和退出时点保持不变。</p>
    {fields.map(({key, label, max, fallback}) => <label key={key}>{label}（秒）
      <input aria-label={label + ' ' + tag.id} type="number" min="0" max={max / 1000} step=".01"
        disabled={key === 'lineDelayMs' && (!multiline || tag.lineAtMs !== undefined)}
        value={(tag.animation?.[key] ?? fallback) / 1000}
        onChange={event => {
          const next = {...tag.animation};
          if (event.target.value === '') delete next[key];
          else {
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            next[key] = Math.max(0, Math.min(max, Math.round(value * 1000)));
          }
          onChange(Object.keys(next).length ? next : undefined);
        }}/>
    </label>)}
    {!multiline && <p className="muted">逐行间隔仅用于多行大字。</p>}
    <label>转为轮廓秒
      <input aria-label={'转为轮廓秒 ' + tag.id} type="number" step=".001"
        min={tag.atMs / 1000} max={latestContextMs / 1000}
        disabled={!onContextTimingChange}
        value={tag.contextAtMs === undefined ? '' : Number((tag.contextAtMs / 1000).toFixed(3))}
        placeholder="不设置"
        onChange={event => {
          if (!event.target.value.trim()) {onContextTimingChange?.(undefined);return;}
          const value=Number(event.target.value);if(!Number.isFinite(value))return;
          onContextTimingChange?.(Math.max(tag.atMs,Math.min(latestContextMs,Math.round(value*1000))));
        }}/>
    </label>
    <p className="muted">设置后在原位转为淡轮廓，保留对照；清空可恢复实心显示。</p>
    <label><input aria-label={'逐行跟随口述时点 ' + tag.id} type="checkbox" checked={tag.lineAtMs !== undefined}
      disabled={!multiline && tag.lineAtMs === undefined}
      onChange={event => onLineTimingsChange(event.target.checked ? defaultLineTimes : undefined)}/>逐行跟随口述时点</label>
    {tag.lineAtMs !== undefined && <>
      <p className="muted">使用场景内原片秒数逐行出现；逐行间隔暂不生效。关闭后恢复错峰间隔。</p>
      {lines.map((line, index) => <label key={index}>第{index + 1}行出现秒 · {line}
        <input aria-label={'第' + (index + 1) + '行出现秒 ' + tag.id} type="number" step=".001"
          min={(tag.lineAtMs?.[index - 1] ?? tag.atMs) / 1000}
          max={(tag.lineAtMs?.[index + 1] ?? Math.max(tag.atMs, tag.endMs - .001)) / 1000}
          value={Number(((tag.lineAtMs?.[index] ?? defaultLineTimes[index]) / 1000).toFixed(3))}
          onChange={event => {
            if (!event.target.value.trim()) return;
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            const next = lines.map((_, i) => tag.lineAtMs?.[i] ?? defaultLineTimes[i]);
            const lower = Math.max(tag.atMs, next[index - 1] ?? tag.atMs);
            const upper = Math.min(Math.max(tag.atMs, tag.endMs - .001), next[index + 1] ?? tag.endMs);
            next[index] = Math.max(lower, Math.min(upper, Math.round(value * 1000)));
            onLineTimingsChange(next);
          }}/>
      </label>)}
    </>}
    <button type="button" disabled={tag.animation === undefined} onClick={() => onChange(undefined)}>恢复默认动画</button>
  </details>;
}
