import React, {useMemo, useState} from 'react';
import type {Caption} from '../src/captions';
import {draftPlan, presentation, redraftSentence, rhythmHints} from '../src/plan.mjs';

type Word = {id: string; text: string; startMs: number; endMs: number};
type Sentence = {id: string; text: string; startMs: number; endMs: number; shot: string; punch?: {text: string; atMs?: number} | null; slide?: {kind: string; items: {title: string; atWordId?: string}[]} | null; faceConflict?: string};

const shots = [
  ['medium', '中景'],
  ['shift-right', '人靠右'],
  ['punch', '推进'],
] as const;

export function PlanReview({captions, clipId, onClose}: {captions: Caption[]; clipId?: string; onClose: () => void}) {
  const words = useMemo<Word[]>(() => captions.filter(caption => !clipId || caption.clipId === clipId).flatMap(caption => caption.words.map((word, index) => ({id: `${caption.id}-${index}`, text: word.text, startMs: word.startMs, endMs: word.endMs}))), [captions, clipId]);
  const [plan, setPlan] = useState(() => draftPlan({words}));
  const view = presentation({plan, words, removes: [], faceBox: null, clip: {inSec: 0, outSec: (words.at(-1)?.endMs ?? 1000) / 1000 + 1}});
  const hints = rhythmHints(plan.sentences);
  const setSentence = (id: string, patch: Partial<Sentence>) => setPlan(current => ({...current, sentences: current.sentences.map(sentence => sentence.id === id ? {...sentence, ...patch} : sentence)}));
  return (
    <dialog open aria-labelledby="plan-title" className="rounded-xl bg-surface text-on-surface p-5 w-[min(960px,96vw)] max-h-[86vh] overflow-auto">
      <div className="flex justify-between"><h2 id="plan-title" className="font-bold text-lg">分镜审阅</h2><button type="button" onClick={onClose}>关闭</button></div>
      <p className="my-2 text-sm">景别和大字可以改。改完不重新识别，词时间保持原样。预览和导出用同一份投影。</p>
      {hints.map(hint => <p key={hint.sentenceId + hint.message} className="text-sm">{hint.message}</p>)}
      {plan.sentences.map(sentence => {
        const shown = view.plan.sentences.find(row => row.id === sentence.id) ?? sentence;
        return (
          <article key={sentence.id} className="border border-outline-variant rounded p-3 my-2">
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
