import React from 'react';
import {AbsoluteFill, OffthreadVideo} from 'remotion';
import type {PlanStyle} from '../plan.mjs';

// Editor preview matches the export: full-bleed 16:9, pull back to 0.80
// (push 1.08), original picture, mirror only the uncovered edge. No wallpaper
// and no rounded window.
const FACE = {
  medium: '30% 46%',
  'shift-right': '70% 46%',
  punch: '50% 42%',
} as const;

export function Talking({shot, src, style, time}: {shot: string; src?: string; style?: Partial<PlanStyle>; time?: number}) {
  const zoom = shot === 'punch' ? 1.08 : 0.8;
  const origin = FACE[shot as keyof typeof FACE] ?? FACE.medium;
  void style;
  return (
    <AbsoluteFill style={{background: '#111', overflow: 'hidden'}} data-talent-scale={zoom} data-talent-shot={shot} data-framing="fullbleed">
      {zoom < 1 && src ? (
        <OffthreadVideo src={src} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: origin, transform: 'scaleX(-1)'}} />
      ) : null}
      <div style={{position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: origin}}>
        {src ? <OffthreadVideo src={src} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: origin}} /> : <div style={{width: '100%', height: '100%', background: '#333'}} />}
      </div>
      {time != null ? <span style={{display: 'none'}}>{time}</span> : null}
    </AbsoluteFill>
  );
}
