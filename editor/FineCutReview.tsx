import React, {useEffect, useRef, useState} from 'react';
import type {Caption} from '../src/captions';
import type {Clip} from '../src/timeline';

type Remove = {id: string; kind: string; startMs: number; endMs: number; reason: string; evidence?: string[]; status: string; confidence?: string; portId?: number; gapIndex?: number};
type Plan = {words: {corrections: {id: string; before: string; after: string; status: string; reason: string}[]}; cutlist: {removes: Remove[]; audioOffsetMs: number}};

const label: Record<string, string> = {pause: '气口', retake: '重说', 'false-start': '起句失败'};

export function FineCutReview({clip, captions, onClose, onApply, onPause}: {clip: Clip; captions: Caption[]; onClose: () => void; onApply: (result: {replaceId: string; clip: Clip; captions: Caption[]}) => void; onPause: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
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
        setBusy('');
      })
      .catch(reason => { setError(String(reason instanceof Error ? reason.message : reason)); setBusy(''); });
  }, [clip, captions]);
  const setStatus = (id: string, status: string) => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => row.id === id ? {...row, status} : row)}}));
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
  const render = async () => {
    if (!plan) return;
    setBusy('正在用 FFmpeg 按剪辑单生成精剪…');
    setError('');
    try {
      const response = await fetch('/api/fine-cut/render', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({clip, words: captions.filter(caption => caption.clipId === clip.id).flatMap(caption => caption.words), captions, cutlist: plan.cutlist})});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '导出失败');
      onApply(data);
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
      setBusy('');
    }
  };
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="fine-cut-title" className="rounded-xl bg-surface text-on-surface p-5 w-[min(880px,96vw)] max-h-[86vh] overflow-auto backdrop:bg-black/60">
    <div className="flex justify-between"><h2 id="fine-cut-title" className="font-bold text-lg">精剪审阅</h2><button type="button" onClick={onClose}>关闭</button></div>
    <p className="my-2 text-sm">粗剪会去掉单独的语气词、起句失败，以及 14 秒内重说的前一遍（保留最后一遍）。长停顿按档压缩：超过 3 秒收到 0.75 秒，0.9 到 3 秒收到 0.60 秒，0.6 到 0.9 秒收到 0.45 秒，更短的气口不动。词尾至少留 0.22 秒，下一次起音前留 0.12 秒。这些都先列出来，接受后才进入时间线。超过 12 秒的删除标成待复核。试听范围是剪点前后各 1 秒。</p>
    <audio ref={audio} src={'/' + clip.src} preload="none" />
    {busy && <p role="status">{busy}</p>}
    {error && <p role="alert">{error}</p>}
    {plan && <>
      <p className="text-sm">术语候选 {plan.words.corrections.length} 条，仍待定，不会改词时间。</p>
      <div className="flex gap-3 my-3"><button type="button" onClick={acceptPauses}>接受全部气口</button><button type="button" onClick={() => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => row.kind === 'pause' || row.kind === 'filler' || row.kind === 'false-start' || row.kind === 'retake' ? {...row, status: 'accepted'} : row)}}))}>接受这版粗剪</button><button type="button" onClick={() => setPlan(current => current && ({...current, cutlist: {...current.cutlist, removes: current.cutlist.removes.map(row => ({...row, status: row.confidence === 'review' ? 'pending' : 'proposed'}))}}))}>全部改回未决定</button></div>
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
