import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {usePlanFonts} from './Fonts';
import {Talking} from './Talking';
import {PunchText} from './PunchText';
import {Slides} from './Slides';
import {FONT_BOLD, FONT_HEAVY, FONT_MED, ORANGE, YELLOW, heavyText} from './theme';

type Sentence = {
  id: string; startMs: number; endMs: number; text: string; shot: string; chapterId?: string | null;
  punch?: {text: string; atMs: number} | null;
  slide?: {kind: string; items: {id?: string; title: string; atMs?: number | null; status?: string}[]} | null;
  labels?: {text: string; atMs: number}[];
  pip?: boolean; cta?: boolean; faceConflict?: string;
};
type Plan = {chapters?: {id: string; title: string; startMs: number}[]; sentences: Sentence[]; style?: Partial<import('../plan.mjs').PlanStyle>};

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
  return (
    <AbsoluteFill style={{background: '#14120f'}}>
      {!onSlide && sentence ? <Talking shot={sentence.shot} src={src} style={plan.style} /> : null}
      {onSlide && sentence?.slide ? <Slides kind={sentence.slide.kind} items={sentence.slide.items} timeMs={timeMs} /> : null}
      {onSlide && src ? <PiP src={src} /> : null}
      {sentence?.punch && !onSlide ? <PunchText text={sentence.punch.text} atMs={sentence.punch.atMs} place={sentence.shot === 'shift-right' ? 'left' : 'lower'} /> : null}
      {(sentence?.labels ?? []).map(label => timeMs >= label.atMs ? <div key={label.text} style={{position: 'absolute', left: '8%', top: '8%', background: 'rgba(58,58,58,0.88)', color: YELLOW, fontFamily: FONT_BOLD, fontSize: 28, borderRadius: 999, padding: '8px 18px'}}>{label.text}</div> : null)}
      {chapterStart ? <ChapterCard title={chapterStart.title} /> : null}
      {sentence?.cta ? <div style={{position: 'absolute', left: 80, bottom: 160, ...heavyText(YELLOW, 8), fontFamily: FONT_HEAVY, fontSize: 72}}>{sentence.text}</div> : null}
      {sentence && !sentence.cta ? <Subtitle text={sentence.text} /> : null}
      <Progress chapters={plan.chapters ?? []} timeMs={timeMs} totalMs={durationInFrames / fps * 1000} title={chapter?.title} />
    </AbsoluteFill>
  );
}

function ChapterCard({title}: {title: string}) {
  return <div style={{position: 'absolute', left: 80, top: '30%', ...heavyText(YELLOW, 10), fontFamily: FONT_HEAVY, fontSize: 84}}>{title}</div>;
}

function Subtitle({text}: {text: string}) {
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 88, display: 'flex', justifyContent: 'center'}}>
      <div style={{background: 'rgba(48,48,48,0.62)', color: '#fff', fontFamily: FONT_MED, fontSize: 40, padding: '6px 22px 10px', borderRadius: 10, maxWidth: '70%', textAlign: 'center'}}>{text}</div>
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
      <Talking shot="medium" src={src} style={{talentFraming: 'fullscreen', windowScale: 1, shiftWindowScale: 1, punchScale: 1, fullscreenPunchScale: 1, fullscreenShiftScale: 1, maxSourceScale: 1, maxPunchSourceScale: 1}} />
    </div>
  );
}

export function PlanPreview({sentence, words, style}: {sentence: Sentence; words?: {text: string; startMs: number; endMs: number}[]; style?: Plan['style']}) {
  usePlanFonts();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = Math.round(frame / fps * 1000);
  const plan: Plan = {chapters: [], sentences: [{...sentence, startMs: 0, endMs: 2000, punch: sentence.punch ? {...sentence.punch, atMs: Math.max(0, (sentence.punch.atMs ?? sentence.startMs) - sentence.startMs)} : null}], style};
  return (
    <AbsoluteFill>
      <PlanVideo plan={plan} />
      <span style={{display: 'none'}}>{words?.length ?? 0}{local}</span>
    </AbsoluteFill>
  );
}
