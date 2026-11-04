import React, {useEffect, useRef, useState} from 'react';
import type {Caption} from '../src/captions';
import type {Clip} from '../src/timeline';

type Remove = {id: string; kind: string; startMs: number; endMs: number; reason: string; evidence?: string[]; status: string; confidence?: string; portId?: number; gapIndex?: number};
type Correction = {id: string; before: string; after: string; status: string; reason: string; source?: string; wordIds?: string[]};
type Word = {id?: string; text: string; startMs: number; endMs: number};
type Plan = {glossary?: string; words: {words?: Word[]; corrections: Correction[]}; cutlist: {removes: Remove[]; audioOffsetMs: number}};

const label: Record<string, string> = {pause: '气口', retake: '重说', 'false-start': '起句失败', filler: '语气词'};

export function FineCutReview({clip, captions, onClose, onApply, onPause}: {clip: Clip; captions: Caption[]; onClose: () => void; onApply: (result: {replaceId: string; clip: Clip; captions: Caption[]}) => void; onPause: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [glossary, setGlossary] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('正在读取词时间和气口…');
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => {
    const words = captions.filter(caption => caption.clipId === clip.id).flatMap(caption => caption.words.map(word => ({text: word.text, startMs: word.startMs, endMs: word.endMs})));
    void fetch('/api/fine-cut/plan', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({clip, words})})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error || '分析失败');
        setPlan(data);
        setGlossary(data.glossary ?? '');
        setBusy('');
      })
      .catch(reason => { setError(String(reason instanceof Error ? reason.message : reason)); setBusy(''); });
  }, [clip, captions]);
  const setStatus = (id: string, status: string) => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => row.id === id ? {...row, status} : row)}}));
  const setCorrection = (id: string, status: string) => setPlan(current => current && ({...current, words: {...current.words, corrections: current.words.corrections.map(row => row.id === id ? {...row, status} : row)}}));
  const acceptPauses = () => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => row.kind === 'pause' ? {...row, status: 'accepted'} : row)}}));
  const listen = async (row: Remove) => {
    const media = audio.current;
    if (!media) return;
    onPause();
    const from = Math.max(0, row.startMs / 1000 - 1);
    const to = row.endMs / 1000 + 1;
    media.ontimeupdate = () => { if (media.currentTime >= to) media.pause(); };
    media.currentTime = from;
    await media.play();
  };
  const recheck = async () => {
    if (!plan) return;
    setBusy('正在用词库检查转写…');
    setError('');
    try {
      const response = await fetch('/api/fine-cut/corrections', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({glossary, words: plan.words.words ?? []})});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '词库检查失败');
      setPlan(current => {
        if (!current) return current;
        const extra = current.words.corrections.filter(row => (row.source === 'user' || row.source === 'llm') && !data.corrections.some((item: Correction) => item.before === row.before && item.after === row.after));
        return {...current, glossary, words: {...current.words, corrections: [...data.corrections, ...extra]}};
      });
      void fetch('/api/settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({glossary})}).catch(() => setNote('词库已用于这次检查，但没有写入设置'));
      setBusy('');
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
      setBusy('');
    }
  };
  const suggest = async () => {
    if (!plan) return;
    setBusy('正在让本机模型看英文和术语…');
    setError('');
    setNote('');
    try {
      const text = (plan.words.words ?? []).map(word => word.text).join('');
      const response = await fetch('/api/fine-cut/suggest', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text})});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '模型提议失败');
      if (data.warning) setNote(data.warning);
      setPlan(current => {
        if (!current) return current;
        const added = (data.suggestions ?? []).filter((row: Correction) => !current.words.corrections.some(item => item.before === row.before && item.after === row.after)).map((row: Correction, index: number) => ({...row, id: `llm${Date.now()}${index}`, status: 'proposed', source: 'llm'}));
        return {...current, words: {...current.words, corrections: [...current.words.corrections, ...added]}};
      });
      setBusy('');
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
      setBusy('');
    }
  };
  const addManual = () => {
    const left = before.trim();
    const right = after.trim();
    if (!left || !right || left === right) return;
    setPlan(current => {
      if (!current || current.words.corrections.some(row => row.before === left && row.after === right)) return current;
      return {...current, words: {...current.words, corrections: [...current.words.corrections, {id: `u${Date.now()}`, before: left, after: right, status: 'accepted', source: 'user', reason: '手工改正显示文字，不改词时间', wordIds: []}]}};
    });
    setBefore('');
    setAfter('');
  };
  const render = async () => {
    if (!plan) return;
    setBusy('正在用 FFmpeg 按剪辑单生成精剪…');
    setError('');
    try {
      const response = await fetch('/api/fine-cut/render', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({clip, words: captions.filter(caption => caption.clipId === clip.id).flatMap(caption => caption.words), captions, cutlist: plan.cutlist, glossary, corrections: plan.words.corrections})});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '导出失败');
      onApply(data);
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
      setBusy('');
    }
  };
  const transcript = (plan?.words.words ?? []).map(word => word.text).join('');
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="fine-cut-title" className="rounded-xl bg-surface text-on-surface p-5 w-[min(880px,96vw)] max-h-[86vh] overflow-auto backdrop:bg-black/60">
    <div className="flex justify-between"><h2 id="fine-cut-title" className="font-bold text-lg">精剪审阅</h2><button type="button" onClick={onClose}>关闭</button></div>
    <p className="my-2 text-sm">粗剪会去掉单独的语气词、起句失败，以及 14 秒内重说的前一遍（保留最后一遍）。长停顿按档压缩：超过 3 秒收到 0.75 秒，0.9 到 3 秒收到 0.60 秒，0.6 到 0.9 秒收到 0.45 秒，更短的气口不动。词尾至少留 0.22 秒，下一次起音前留 0.12 秒。这些都先列出来，接受后才进入时间线。超过 12 秒的删除标成待复核。试听范围是剪点前后各 1 秒。</p>
    <audio ref={audio} src={'/' + clip.src} preload="none" />
    {busy && <p role="status">{busy}</p>}
    {error && <p role="alert">{error}</p>}
    {note && <p role="status">{note}</p>}
    {plan && <>
      <section className="border border-outline-variant rounded p-3 my-3">
        <h3 className="font-bold">转写校对</h3>
        <p className="text-sm my-2">大字和标签用校对后的整句。词库里的一行同时是热词和显示替换，热词在下次转写时交给识别。剪辑判断仍用原始识别。本机模型只提议英文和术语，不接受就不生效。</p>
        <p className="text-sm max-h-32 overflow-auto whitespace-pre-wrap border border-outline-variant rounded p-2" aria-label="转写">{transcript || '这段还没有逐字转写。'}</p>
        <label className="block text-sm mt-3">热词和改正，一行一个。正确写法｜识别错写<textarea className="w-full mt-1 rounded border border-outline-variant p-2" rows={4} value={glossary} onChange={event => setGlossary(event.target.value)} /></label>
        <div className="flex gap-3 my-3 flex-wrap">
          <button type="button" onClick={() => void recheck()}>用这份词库检查</button>
          <button type="button" onClick={() => void suggest()}>让本机模型提议英文和术语</button>
        </div>
        {plan.words.corrections.map(row => <article key={row.id} className="border border-outline-variant rounded p-3 my-2">
          <p>{row.before} → {row.after} · {row.status === 'accepted' ? '已接受' : row.status === 'rejected' ? '已拒绝' : '待定'}{row.source === 'llm' ? ' · 模型提议' : row.source === 'glossary' ? ' · 词库' : row.source === 'user' ? ' · 手工' : ''}</p>
          <p className="text-sm">{row.reason}</p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setCorrection(row.id, 'accepted')}>接受</button>
            <button type="button" onClick={() => setCorrection(row.id, 'rejected')}>拒绝</button>
          </div>
        </article>)}
        {!plan.words.corrections.length && <p className="text-sm">还没有术语改正。</p>}
        <div className="flex gap-2 my-3 flex-wrap items-center">
          <input aria-label="识别到的写法" className="rounded border border-outline-variant p-2" value={before} onChange={event => setBefore(event.target.value)} placeholder="识别到的写法" />
          <input aria-label="改成" className="rounded border border-outline-variant p-2" value={after} onChange={event => setAfter(event.target.value)} placeholder="改成" />
          <button type="button" onClick={addManual}>加上这条改正</button>
        </div>
      </section>
      <div className="flex gap-3 my-3 flex-wrap"><button type="button" onClick={acceptPauses}>接受全部气口</button><button type="button" onClick={() => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => row.kind === 'pause' || row.kind === 'filler' || row.kind === 'false-start' || row.kind === 'retake' ? {...row, status: 'accepted'} : row)}}))}>接受这版粗剪</button><button type="button" onClick={() => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => ({...row, status: row.confidence === 'review' ? 'pending' : 'proposed'}))}}))}>全部改回未决定</button></div>
      {plan.cutlist.removes.map(row => <article key={row.id} className="border border-outline-variant rounded p-3 my-2">
        <p>{label[row.kind] ?? row.kind} · {(row.startMs / 1000).toFixed(2)}–{(row.endMs / 1000).toFixed(2)} 秒 · {row.status === 'accepted' ? '已接受' : row.status === 'rejected' ? '已拒绝' : row.status === 'pending' ? '待复核' : '待定'}</p>
        <p className="text-sm">{row.reason}</p>
        {!!row.evidence?.length && <p className="text-sm opacity-80">证据：{row.evidence.join(' ｜ ')}</p>}
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={() => void listen(row)}>试听前后 1 秒</button>
          <button type="button" onClick={() => setStatus(row.id, 'accepted')}>接受</button>
          <button type="button" onClick={() => setStatus(row.id, 'rejected')}>拒绝</button>
        </div>
      </article>)}
      {!plan.cutlist.removes.length && <p>这段没有明显拖长的气口，也没有发现重说候选。</p>}
      <button type="button" className="lime-button" disabled={!!busy} onClick={() => void render()}>生成精剪到时间线</button>
    </>}
  </dialog>;
}
