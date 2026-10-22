import React, {useEffect, useRef, useState} from 'react';
import type {Caption} from '../src/captions';
import {useEditor} from './store';

const storedToken = (key: string) => {try {return localStorage.getItem(key) ?? '';} catch {return '';}};
export function CaptionTimingEditor({caption, src}: {caption: Caption; src: string}) {
  const initial = useRef({startMs: caption.startMs, endMs: caption.endMs, text: caption.words.map(word => word.text).join('')});
  const rawAnchor = caption.reviewOriginalTiming ?? initial.current;
  const anchor = {startMs: rawAnchor.startMs, endMs: rawAnchor.endMs, text: rawAnchor.text};
  const storageKey = 'caption-timing-review-undo:' + JSON.stringify({src, anchor});
  const [start, setStart] = useState(String(caption.startMs / 1000));
  const [end, setEnd] = useState(String(caption.endMs / 1000));
  const [token, setToken] = useState(() => storedToken(storageKey));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const draftApplied = !!start.trim() && !!end.trim() && Number.isFinite(Number(start)) && Number.isFinite(Number(end)) &&
    Math.round(Number(start) * 1000) === caption.startMs && Math.round(Number(end) * 1000) === caption.endMs && caption.holdMs === 0;
  useEffect(() => {
    setStart(String(caption.startMs / 1000));setEnd(String(caption.endMs / 1000));
  }, [caption.id, caption.startMs, caption.endMs]);
  useEffect(() => {setToken(storedToken(storageKey));}, [storageKey]);
  const apply = () => {
    setMessage('');
    if (!start.trim() || !end.trim() || !Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) {
      setMessage('请输入有效的原片起止秒数。');return;
    }
    const startMs = Math.round(Number(start) * 1000), endMs = Math.round(Number(end) * 1000);
    const state = useEditor.getState();
    const current = state.captions.find(item => item.id === caption.id);
    const clip = state.clips.find(item => item.id === current?.clipId);
    if (!current || !clip) {setMessage('当前字幕没有对应的原片片段。');return;}
    if (endMs <= startMs || startMs < clip.inSec * 1000 || endMs > clip.outSec * 1000) {
      setMessage(`起止须位于原片片段 ${clip.inSec.toFixed(3)}—${clip.outSec.toFixed(3)} 秒内，结束须晚于开始。`);return;
    }
    if (state.captions.some(item => item.id !== current.id && item.clipId === current.clipId && startMs < item.endMs && endMs > item.startMs)) {
      setMessage('此范围与同一原片片段的其他字幕重叠，请调整起止。');return;
    }
    state.setCaptionTiming(caption.id, startMs, endMs);
    setMessage('已应用整句起止，可用编辑器撤销；逐词时间保持原样。');
  };
  const request = async (action: 'save' | 'undo') => {
    setBusy(true);setMessage('');
    try {
      const response = await fetch('/api/caption-timing-reviews/' + action, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(action === 'save' ? {src, audioClock:caption.audioClock, anchor, range: {startMs: caption.startMs, endMs: caption.endMs}, holdMs: 0} : {src, token}),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '整句校时记录未保存。');
      if (action === 'save') {
        setToken(result.token);localStorage.setItem(storageKey, result.token);
        setMessage('已保存整句起止供同一原片重生成复用；不重估逐词时间。');
      } else {
        setToken('');localStorage.removeItem(storageKey);
        setMessage('已撤回重生成校时记录；当前工程起止保留，可用编辑器撤销还原。');
      }
    } catch (error) {setMessage(error instanceof Error ? error.message : '操作未完成。');}
    finally {setBusy(false);}
  };
  return <details className="mt-2 mb-3 text-[11px] text-on-surface-variant">
    <summary>校正整句起止</summary>
    <p>使用原片时间，应用后句末不延留；只改整句起止，不重估逐词时间。</p>
    <div className="grid grid-cols-2 gap-2 my-2">
      <label className="min-w-0">原片开始秒<input className="w-full mt-1 px-2 py-1.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface" aria-label={'字幕原片开始秒 ' + caption.id} type="number" min="0" step=".001" value={start} onChange={event => setStart(event.target.value)} disabled={busy}/></label>
      <label className="min-w-0">原片结束秒<input className="w-full mt-1 px-2 py-1.5 rounded border border-outline-variant bg-surface-container-lowest text-on-surface" aria-label={'字幕原片结束秒 ' + caption.id} type="number" min="0" step=".001" value={end} onChange={event => setEnd(event.target.value)} disabled={busy}/></label>
    </div>
    <button type="button" disabled={busy} onClick={apply} className="w-full px-2 py-1.5 rounded border border-outline-variant">应用整句起止</button>
    <button type="button" disabled={busy || caption.timingScope !== 'cue' || !draftApplied} onClick={() => void request('save')} className="block mt-2 underline disabled:opacity-40">保存整句校时供重生成复用</button>
    {token && <button type="button" disabled={busy} onClick={() => void request('undo')} className="block mt-2 underline">撤回整句校时复用记录</button>}
    {message && <p role="status">{message}</p>}
  </details>;
}
