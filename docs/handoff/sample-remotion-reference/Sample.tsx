import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Fonts} from './Fonts';
import {Talking, Framing} from './components/Talking';
import {PunchText} from './components/PunchText';
import {Label} from './components/Label';
import {ChapterCard} from './components/ChapterCard';
import {PiP} from './components/PiP';
import {CompareSlide, ChecklistSlide, WorkflowSlide} from './components/Slides';
import {ProgressBar} from './components/ProgressBar';
import {Subtitles} from './components/Subtitles';
import {CTA} from './components/CTA';

export const Sample: React.FC<{plan: any}> = ({plan}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const t = frame / fps;
  const src = plan.meta.source;
  const shot = plan.shots.find((s: any) => t >= s.start && t < s.end) ?? plan.shots[plan.shots.length - 1];
  const framing: Framing = shot.type === 'chapter' ? 'right' : shot.type === 'slide' ? 'medium' : shot.framing;
  const slides: Record<string, React.FC<any>> = {compare: CompareSlide, checklist: ChecklistSlide, workflow: WorkflowSlide};
  const Slide = shot.type === 'slide' ? slides[shot.slide] : null;
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <Fonts />
      {/* base layer: always mounted so the original audio plays continuously */}
      <Talking framing={framing} src={src} />
      {shot.type === 'chapter' ? <ChapterCard pill={shot.pill} lines={shot.lines} start={shot.start} /> : null}
      {Slide ? <><Slide d={plan.slides[shot.slide]} start={shot.start} /><PiP src={src} /></> : null}
      {plan.punchTexts.filter((p: any) => t >= p.start && t < p.end).map((p: any, i: number) => <PunchText key={i} lines={p.lines} pos={p.pos} />)}
      {plan.labels.filter((l: any) => t >= l.start && t < l.end).map((l: any, i: number) => <Label key={i} t={l.t} x={l.x} y={l.y} at={l.start} />)}
      {t >= plan.cta.start ? <CTA d={plan.cta} /> : null}
      <Subtitles subs={plan.subtitles} />
      <ProgressBar chapters={plan.chapters} total={plan.meta.duration} />
    </AbsoluteFill>
  );
};
