import React from 'react';
import {AbsoluteFill, OffthreadVideo} from 'remotion';
import {talentScale, windowRect, type PlanStyle} from '../plan.mjs';

export function Talking({shot, src, style, time}: {shot: string; src?: string; style?: Partial<PlanStyle>; time?: number}) {
  const scale = talentScale(shot, style);
  const rect = windowRect(shot, style);
  const framed = (style?.talentFraming ?? 'framed') !== 'fullscreen';
  const inner = shot === 'punch' ? (framed ? (style?.punchScale ?? 1.1) : 1) : 1;
  return (
    <AbsoluteFill style={{background: 'transparent', overflow: 'hidden'}} data-talent-scale={scale} data-talent-shot={shot}>
      <div style={{
        position: 'absolute',
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
        borderRadius: framed ? 24 : 0,
        overflow: 'hidden',
        boxShadow: framed ? '0 28px 70px rgba(0,0,0,0.45)' : undefined,
        border: framed ? '1px solid rgba(255,255,255,0.14)' : undefined,
      }}>
        {src ? <OffthreadVideo src={src} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${inner})`, transformOrigin: '50% 42%'}} /> : <div style={{width: '100%', height: '100%', background: '#333'}} />}
        {shot === 'punch' ? <AbsoluteFill style={{background: 'radial-gradient(ellipse 62% 70% at 50% 40%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.55) 100%)'}} /> : null}
      </div>
      {time != null ? <span style={{display: 'none'}}>{time}</span> : null}
    </AbsoluteFill>
  );
}
