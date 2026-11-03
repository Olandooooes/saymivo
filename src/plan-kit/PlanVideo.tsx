import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {layoutRects} from '../plan.mjs';
import {usePlanFonts} from './Fonts';
import {Talking} from './Talking';
import {PunchText} from './PunchText';
import {Slides} from './Slides';
import {FONT_BOLD, FONT_HEAVY, FONT_MED, ORANGE, YELLOW, heavyText} from './theme';

type Sentence = {
  id: string; startMs: number; endMs: number; text: string; shot: string; chapterId?: string | null;
  punch?: {text: string; atMs?: number} | null;
  slide?: {kind: string; title?: string; items: {id?: string; title: string; atMs?: number | null; status?: string}[]} | null;
  labels?: {text: string; atMs: number}[];
  pip?: boolean; cta?: boolean; faceConflict?: string;
};
type Phrase = {text: string; startMs: number; endMs: number};
type Plan = {chapters?: {id: string; title: string; startMs: number}[]; sentences: Sentence[]; phrases?: Phrase[]; style?: Partial<import('../plan.mjs').PlanStyle>};

function mediaSrc(src?: string) {
  if (!src) return undefined;
  if (/^(https?:|blob:|data:)/.test(src)) return src;
  return staticFile(src);
}

function at(frame: number, fps: number) {
  return frame / fps * 1000;
}

export function PlanVideo({plan, src}: {plan: Plan; src?: string}) {
  usePlanFonts();
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const timeMs = at(frame, fps);
  const sentence = plan.sentences.find(row => timeMs >= row.startMs && timeMs < row.endMs) ?? plan.sentences.at(-1);
  const chapter = plan.chapters?.find(row => row.id === sentence?.chapterId);
  const chapterStart = plan.chapters?.find(row => timeMs >= row.startMs && timeMs < row.startMs + 800);
  const onSlide = Boolean(sentence?.slide);
  const rects = sentence ? layoutRects(sentence.shot, plan.style) : null;
  const phrase = (plan.phrases ?? []).find(row => timeMs >= row.startMs && timeMs < row.endMs);
  const video = mediaSrc(src);
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 58%, #4a3014 0%, #24180f 42%, #100e0c 100%)'}}>
      {!onSlide && sentence ? <Talking shot={sentence.shot} src={video} style={plan.style} /> : null}
      {onSlide && sentence?.slide ? <Slides kind={sentence.slide.kind} title={sentence.slide.title} items={sentence.slide.items} timeMs={timeMs} /> : null}
      {onSlide && video ? <PiP src={video} /> : null}
      {sentence?.punch?.atMs != null && !onSlide ? <PunchText text={sentence.punch.text} atMs={sentence.punch.atMs} shot={sentence.shot} style={plan.style} /> : null}
      {(sentence?.labels ?? []).map(label => timeMs >= label.atMs ? <div key={label.text} style={{position: 'absolute', left: '8%', top: '8%', background: 'rgba(58,58,58,0.88)', color: YELLOW, fontFamily: FONT_BOLD, fontSize: 28, borderRadius: 999, padding: '8px 18px'}}>{label.text}</div> : null)}
      {chapterStart?.title ? <ChapterCard title={chapterStart.title} /> : null}
      {chapter?.title && rects && !onSlide ? <div style={{position: 'absolute', left: `${rects.chapter.x * 100}%`, top: `${rects.chapter.y * 100}%`, width: `${rects.chapter.w * 100}%`, color: '#fff', fontFamily: FONT_BOLD, fontSize: 28}}>{chapter.title}</div> : null}
      {sentence?.cta ? <div style={{position: 'absolute', left: 80, bottom: 160, ...heavyText(YELLOW, 8), fontFamily: FONT_HEAVY, fontSize: 72}}>{sentence.text}</div> : null}
      {phrase && !sentence?.cta && rects ? <Subtitle text={phrase.text} rect={rects.subtitle} /> : null}
      <Progress chapters={plan.chapters ?? []} timeMs={timeMs} totalMs={durationInFrames / fps * 1000} title={chapter?.title} />
    </AbsoluteFill>
  );
}

function ChapterCard({title}: {title: string}) {
  return <div style={{position: 'absolute', left: 80, top: '30%', ...heavyText(YELLOW, 10), fontFamily: FONT_HEAVY, fontSize: 84}}>{title}</div>;
}

function Subtitle({text, rect}: {text: string; rect: {x: number; y: number; w: number}}) {
  return (
    <div style={{position: 'absolute', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, display: 'flex', justifyContent: 'center'}}>
      <div style={{background: 'rgba(48,48,48,0.62)', color: '#fff', fontFamily: FONT_MED, fontSize: 36, lineHeight: 1.25, padding: '6px 18px 8px', borderRadius: 10, maxWidth: '100%', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{text}</div>
    </div>
  );
}

function Progress({chapters, timeMs, totalMs, title}: {chapters: {id: string; title: string; startMs: number}[]; timeMs: number; totalMs: number; title?: string}) {
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, background: '#050505'}}>
      <div style={{height: 6, width: `${Math.min(100, timeMs / Math.max(1, totalMs) * 100)}%`, background: ORANGE}} />
      <div style={{fontFamily: FONT_BOLD, fontSize: 20, color: '#fff', textAlign: 'center'}}>{title}</div>
      <span style={{display: 'none'}}>{chapters.length}</span>
    </div>
  );
}

function PiP({src}: {src: string}) {
  return (
    <div style={{position: 'absolute', right: 48, bottom: 120, width: '20%', aspectRatio: '1', borderRadius: '50%', overflow: 'hidden', border: '6px solid #fff', boxShadow: `0 0 0 5px ${ORANGE}`}}>
      <OffthreadVideo src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    </div>
  );
}

export function PlanPreview({sentence, phrases = [], style, src}: {sentence: Sentence; phrases?: {text: string; startMs: number; endMs: number}[]; style?: Plan['style']; src?: string}) {
  const origin = sentence.startMs;
  const plan: Plan = {
    chapters: [],
    style,
    phrases: phrases.filter(phrase => phrase.endMs > origin && phrase.startMs < origin + 2000).map(phrase => ({...phrase, startMs: phrase.startMs - origin, endMs: phrase.endMs - origin})),
    sentences: [{...sentence, startMs: 0, endMs: 2000, punch: sentence.punch?.atMs == null ? null : {...sentence.punch, atMs: Math.max(0, sentence.punch.atMs - origin)}}],
  };
  return <PlanVideo plan={plan} src={src} />;
}
