import {captionVisibility} from './caption-visibility.mjs';
import {readableSubtitle} from './reference-motion.mjs';
import React from 'react';
import {useCurrentFrame, useVideoConfig, interpolate, Sequence} from 'remotion';
import type {Caption} from './captions';

export type {Caption} from './captions';

const FONT = 'Inter, -apple-system, system-ui, sans-serif';
const ACCENT = '#FFB020';

// один блок субтитров (внутри своего Sequence)
const CaptionPage: React.FC<{caption: Caption; accentColor: string; durationInFrames: number;reference?:boolean;minimal?:boolean}> = ({caption, accentColor, durationInFrames,reference,minimal}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const absMs = caption.startMs + (frame / fps) * 1000;
  const fontSize = Math.round((reference?(minimal?60:68):62) * (caption.scale ?? 1));

  // soft cross-dissolve: fade in at the start, fade out near the end so a page
  // doesn't snap away the instant the last word is spoken.
  // Guarded for very short pages (1–2 frames after autocut/clip clamping) —
  // interpolate() requires strictly increasing ranges.
  const inF = Math.max(1, Math.min(Math.round(fps * 0.14), Math.floor(durationInFrames / 2)));
  const outStart = Math.max(inF + 1, durationInFrames - Math.round(fps * 0.18));
  const appear = interpolate(frame, [0, inF], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const disappear =
    outStart >= durationInFrames
      ? 1 // page too short for a fade-out
      : interpolate(frame, [outStart, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const opacity = appear * disappear;

  return (
    <div
      style={{
        position: 'absolute',
        top: `${caption.topPct}%`,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 70px',
        opacity,
        transform: `translateY(${interpolate(appear, [0, 1], [10, 0])}px)`,
      }}
    >
     <div
       data-ab={`cap:${caption.id}`}
       style={{
         display: 'flex',
         justifyContent: 'center',
         flexWrap: 'wrap',
         gap: caption.words.some(w=>/[\u3400-\u9fff]/.test(w.text)) ? '0 1px' : '0 16px',
         fontFamily: reference?'PingFang SC,Microsoft YaHei,sans-serif':FONT,
         background:reference?(minimal?'#20262245':'#16181c9e'):undefined,padding:reference?(minimal?'5px 13px':'10px 24px'):undefined,borderRadius:reference?(minimal?5:10):undefined,
       }}
     >
      {reference?<span style={{fontSize,fontWeight:minimal?600:650,color:'#fff',WebkitTextStroke:minimal?'.6px #202421':'1px #111',paintOrder:'stroke fill',lineHeight:1.25,textShadow:minimal?'0 1px 4px #0008':'0 2px 7px #0009',textAlign:'center'}}>{readableSubtitle(caption.words)}</span>:caption.words.map((w, i) => {
        const active = absMs >= w.startMs && absMs <= w.endMs;
        const color = w.accent ? accentColor : active ? '#ffffff' : 'rgba(255,255,255,0.78)';
        return (
          <span
            key={i}
            style={{
              fontSize,
              fontWeight: reference?750:w.accent ? 800 : 600,
              WebkitTextStroke:reference?'1.5px #141414':undefined,paintOrder:'stroke fill',
              lineHeight: 1.25,
              letterSpacing: -0.5,
              color,
              transform: active || w.accent ? 'scale(1.05)' : 'scale(1)',
              display: 'inline-block',
              textShadow: '0 2px 12px rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.35)',
            }}
          >
            {w.text}
          </span>
        );
      })}
     </div>
    </div>
  );
};

// каждая фраза = свой Sequence
export const CaptionTrack: React.FC<{
  captions: Caption[];
  accentColor?: string;reference?:boolean;minimal?:boolean;
}> = ({captions, accentColor = ACCENT,reference,minimal}) => {
  const {fps} = useVideoConfig();
  if (!captions?.length) return null;

  return (
    <>
      {captions.map((c, i) => {
        const nextStart = captions[i + 1]?.startMs ?? Infinity;
        const {from,durationInFrames:dur}=captionVisibility(c,nextStart,fps);
        if(!dur)return null;
        return (
          <Sequence key={c.id} from={from} durationInFrames={dur} layout="none" name={c.words.map((w) => w.text).join(' ')}>
            <CaptionPage caption={c} accentColor={accentColor} reference={reference} minimal={minimal} durationInFrames={dur} />
          </Sequence>
        );
      })}
    </>
  );
};
