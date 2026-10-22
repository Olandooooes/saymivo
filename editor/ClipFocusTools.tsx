import React, {useEffect, useState} from 'react';
import type {Clip, ClipFocusWindow, ClipRect} from '../src/timeline';
import {validFocusRect} from '../src/clip-focus-windows.mjs';

type ClipFocusPatch = Pick<Partial<Clip>, 'fit' | 'showCaptions' | 'focusWindows'>;
const rectText = (r: ClipRect) => [r.x, r.y, r.w, r.h].map(n => Number(n.toFixed(4))).join(', ');

function RectangleField({label, value, onCommit}: {label: string; value: ClipRect; onCommit: (r: ClipRect) => void}) {
  const formatted = rectText(value), [draft, setDraft] = useState(formatted), [invalid, setInvalid] = useState(false);
  useEffect(() => {setDraft(formatted); setInvalid(false);}, [formatted]);
  const commit = () => {
    const values = draft.trim().split(/[,，\s]+/).map(Number);
    const r = {x: values[0], y: values[1], w: values[2], h: values[3]};
    if (values.length !== 4 || !validFocusRect(r)) {setInvalid(true); return;}
    setInvalid(false);
    if (rectText(r) !== formatted) onCommit(r);
  };
  return <label className="block mt-2">{label}
    <input aria-label={label} aria-invalid={invalid} value={draft}
      className="w-full mt-1 px-2 py-1 rounded border border-outline-variant bg-surface-container-lowest font-mono"
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => {if (e.key === 'Enter') e.currentTarget.blur();}} />
    {invalid && <span role="alert" className="block text-error">填写0–1范围的 x, y, w, h，矩形须位于画面内。</span>}
  </label>;
}

function TimeField({label, value, max, onCommit}: {label: string; value: number; max: number; onCommit: (n: number) => boolean}) {
  const [draft, setDraft] = useState(String(value)), [invalid, setInvalid] = useState(false);
  useEffect(() => {setDraft(String(value)); setInvalid(false);}, [value]);
  return <label>{label}<input type="number" min={0} max={max} step={.01} aria-label={label} aria-invalid={invalid}
    value={draft} className="w-full mt-1 px-2 py-1 rounded border border-outline-variant bg-surface-container-lowest"
    onChange={e => setDraft(e.target.value)} onBlur={() => {
      const n = Number(draft);
      setInvalid(draft === '' || !Number.isFinite(n) || n < 0 || n > max || !onCommit(n));
    }} onKeyDown={e => {if (e.key === 'Enter') e.currentTarget.blur();}} />
    {invalid && <span role="alert" className="block text-error">起止须在原片内，结束晚于开始。</span>}
  </label>;
}

export function ClipFocusTools({clip, onChange}: {clip: Clip; onChange: (patch: ClipFocusPatch) => void}) {
  const windows = clip.focusWindows ?? [];
  const edit = (id: string, patch: Partial<ClipFocusWindow>) =>
    onChange({focusWindows: windows.map(w => w.id === id ? {...w, ...patch} : w)});
  return <div className="mt-3 text-[11px] text-on-surface-variant">
    <label className="block">原片画幅<select aria-label="原片画幅" value={clip.fit ?? 'cover'}
      className="w-full mt-1 px-2 py-1 rounded bg-surface-container-lowest"
      onChange={e => onChange({fit: e.target.value as Clip['fit']})}>
      <option value="cover">铺满画面</option><option value="contain">完整画幅</option>
    </select></label>
    <label className="flex items-center gap-2 mt-2"><input type="checkbox" aria-label="显示所选片段新增字幕"
      checked={clip.showCaptions !== false} onChange={e => onChange({showCaptions: e.target.checked})} />显示新增字幕</label>
    <details className="mt-3"><summary>局部放大（{windows.length}）</summary>
      <p className="mt-2">保留原画面，只放大选中区域。时段填写原片秒，矩形填写 x, y, w, h（0–1）。</p>
      {(!clip.sourceWidth || !clip.sourceHeight) && <p role="status">需读取原片尺寸后才能显示局部放大。</p>}
      {windows.map((w, i) => <fieldset key={w.id} className="border border-outline-variant rounded p-2 mt-2">
        <legend>放大 {i + 1}</legend>
        <div className="grid grid-cols-2 gap-2">
          <TimeField label={'放大开始秒 ' + w.id} value={w.startSec} max={clip.sourceDurationSec} onCommit={n => {
            if (n >= w.endSec) return false;
            if (n !== w.startSec) edit(w.id, {startSec: n});
            return true;
          }} />
          <TimeField label={'放大结束秒 ' + w.id} value={w.endSec} max={clip.sourceDurationSec} onCommit={n => {
            if (n <= w.startSec) return false;
            if (n !== w.endSec) edit(w.id, {endSec: n});
            return true;
          }} />
        </div>
        <RectangleField label={'源区域 ' + w.id} value={w.sourceRect} onCommit={r => edit(w.id, {sourceRect: r})} />
        <RectangleField label={'显示区域 ' + w.id} value={w.targetRect} onCommit={r => edit(w.id, {targetRect: r})} />
        <button type="button" className="underline mt-2" onClick={() => onChange({focusWindows: windows.filter(v => v.id !== w.id)})}>移除放大 {i + 1}</button>
      </fieldset>)}
      <button type="button" className="underline mt-2" disabled={clip.outSec <= clip.inSec} onClick={() => onChange({focusWindows: [...windows, {
        id: 'focus-' + Date.now(), startSec: clip.inSec, endSec: Math.min(clip.outSec, clip.inSec + 3),
        sourceRect: {x: .15, y: .25, w: .45, h: .28}, targetRect: {x: .08, y: .3, w: .6, h: .4},
      }]})}>添加局部放大</button>
    </details>
  </div>;
}
