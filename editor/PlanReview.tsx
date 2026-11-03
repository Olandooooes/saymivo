import React, {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import type {Caption} from '../src/captions';
import {draftPlan, presentation, redraftSentence, rhythmHints} from '../src/plan.mjs';
import {PlanPreview} from '../src/plan-kit/PlanVideo';

type Word = {id: string; text: string; startMs: number; endMs: number};
type Sentence = {id: string; text: string; startMs: number; endMs: number; shot: string; punch?: {text: string; atMs?: number} | null; slide?: {kind: string; items: {title: string; atWordId?: string}[]} | null; faceConflict?: string};

const shots = [
  ['medium', '中景'],
  ['shift-right', '人靠右'],
  ['punch', '推进'],
] as const;

export function PlanReview({captions, clipId, removes = [], faceBox = null, src, onClose}: {captions: Caption[]; clipId?: string; removes?: {status?: string; startMs: number; endMs: number}[]; faceBox?: {x: number; y: number; w: number; h: number} | null; src?: string; onClose: () => void}) {
  const words = useMemo<Word[]>(() => captions.filter(caption => !clipId || caption.clipId === clipId).flatMap(caption => caption.words.map((word, index) => ({id: `${caption.id}-${index}`, text: word.text, startMs: word.startMs, endMs: word.endMs}))), [captions, clipId]);
  const [plan, setPlan] = useState(() => draftPlan({words, removes}));
  const [currentId, setCurrentId] = useState(plan.sentences[0]?.id ?? '');
  const [llm, setLlm] = useState<{enabled: boolean; model: string | null; message: string}>({enabled: false, model: null, message: ''});
  const [drafting, setDrafting] = useState(false);
  const [llmNote, setLlmNote] = useState('');
  useEffect(() => {
    void fetch('/api/plan/llm').then(async response => response.ok ? response.json() : {enabled: false}).then(data => setLlm({enabled: Boolean(data.enabled), model: data.model ?? null, message: data.message ?? ''})).catch(() => setLlm({enabled: false, model: null, message: ''}));
  }, []);
  const askModel = async () => {
    setDrafting(true);
    setLlmNote(llm.model ? `正在用 ${llm.model} 起草…` : '正在起草…');
    try {
      const response = await fetch('/api/plan/draft', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/x-ndjson'}, body: JSON.stringify({words, removes, faceBox})});
      if (!response.ok || !response.body) throw Error('起草没有返回进度');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const done = {payload: null as {plan?: typeof plan; warnings?: {message?: string}[]; model?: string | null} | null};
      const take = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as {type?: string; status?: string; model?: string; batch?: number; total?: number; plan?: typeof plan; warnings?: {message?: string}[]};
        if (event.type === 'progress') {
          const action = event.status === 'retry' ? '失败，正在重试' : event.status === 'fallback' ? '已改用规则底稿' : '正在起草';
          setLlmNote(`${event.model} · 第 ${event.batch}/${event.total} 批${action}`);
        } else if (event.type === 'done') done.payload = event;
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) take(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) take(buffer);
      const finished = done.payload;
      if (finished?.plan?.sentences) { setPlan(finished.plan); setCurrentId(finished.plan.sentences[0]?.id ?? ''); }
      const warnings = (finished?.warnings ?? []).map(item => item.message).filter((message): message is string => Boolean(message));
      setLlmNote([finished?.model ? `模型 ${finished.model}` : '', ...warnings].join('；'));
    } catch (error) {
      setLlmNote(error instanceof Error ? error.message : '起草失败，已保留规则底稿');
    } finally {
      setDrafting(false);
    }
  };
  const clip = {inSec: 0, outSec: (words.at(-1)?.endMs ?? 1000) / 1000 + 1};
  const view = presentation({plan, words, removes, faceBox, clip});
  const hints = rhythmHints(plan.sentences);
  const setSentence = (id: string, patch: Partial<Sentence>) => setPlan(current => ({...current, sentences: current.sentences.map(sentence => sentence.id === id ? {...sentence, ...patch} : sentence)}));
  return (
    <dialog open aria-labelledby="plan-title" className="rounded-xl bg-surface text-on-surface p-5 w-[min(960px,96vw)] max-h-[86vh] overflow-auto">
      <div className="flex justify-between"><h2 id="plan-title" className="font-bold text-lg">分镜审阅</h2><button type="button" onClick={onClose}>关闭</button></div>
      <p className="my-2 text-sm">景别和大字可以改。改完不重新识别，词时间保持原样。预览和导出用同一份投影。</p>
      {llm.enabled ? <button type="button" onClick={() => void askModel()} disabled={drafting}>{drafting ? '正在起草…' : `用 ${llm.model} 起草分镜`}</button> : llm.message ? <p className="text-sm">{llm.message}</p> : null}
      {llmNote ? <p className="text-sm" role="status">{llmNote}</p> : null}
      {(plan.warnings ?? []).map((item: {code?: string; message?: string; sentenceId?: string}, index: number) => <p key={`${item.sentenceId ?? ''}-${index}`} className="text-sm">{item.message}</p>)}
      {hints.map(hint => <p key={hint.sentenceId + hint.message} className="text-sm">{hint.message}</p>)}
      {view.plan.sentences.filter(sentence => sentence.id === currentId).map(sentence => <Player key={sentence.id} component={PlanPreview} inputProps={{sentence, phrases: view.plan.phrases, style: view.style, src}} durationInFrames={60} compositionWidth={1920} compositionHeight={1080} fps={30} controls style={{width: '100%', aspectRatio: '16/9', background: '#111'}} />)}
      {plan.sentences.map(sentence => {
        const shown = view.plan.sentences.find(row => row.id === sentence.id) ?? sentence;
        return (
          <article key={sentence.id} className="border border-outline-variant rounded p-3 my-2" onClick={() => setCurrentId(sentence.id)}>
            <p>{sentence.text}</p>
            <label className="text-sm">景别 <select aria-label={`${sentence.id} 景别`} value={sentence.shot} onChange={event => setSentence(sentence.id, {shot: event.target.value})}>{shots.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm block">大字 <input aria-label={`${sentence.id} 大字`} value={sentence.punch?.text ?? ''} onChange={event => setSentence(sentence.id, {punch: event.target.value ? {text: event.target.value, atMs: sentence.startMs} : null})} /></label>
            {sentence.slide?.items.map((item, index) => <label key={item.title} className="text-sm block">条目 <input aria-label={`${sentence.id} 条目 ${index + 1}`} value={item.title} onChange={event => {
              const items = sentence.slide!.items.map((row, rowIndex) => rowIndex === index ? {...row, title: event.target.value} : row);
              setSentence(sentence.id, {slide: {...sentence.slide!, items}});
            }} /></label>)}
            {shown.faceConflict ? <p className="text-sm text-error">大字压住脸，已改回中景</p> : null}
            <button type="button" onClick={() => setPlan(current => redraftSentence(current, words, sentence.id))}>重算这一句</button>
          </article>
        );
      })}
    </dialog>
  );
}
