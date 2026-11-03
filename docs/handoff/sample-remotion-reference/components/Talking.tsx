import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion';
export type Framing = 'medium' | 'right' | 'punch';
const T: Record<Framing, string> = {
  medium: 'translate(0px,0px) scale(1)',
  right: 'translate(230px,-115px) scale(1.25)',
  punch: 'translate(0px,-185px) scale(1.36)',
};
export const Talking: React.FC<{framing: Framing; src: string}> = ({framing, src}) => (
  <AbsoluteFill style={{overflow: 'hidden', backgroundColor: '#000'}}>
    <OffthreadVideo src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: T[framing], transformOrigin: '50% 50%'}} />
    {framing === 'punch' ? <AbsoluteFill style={{background: 'radial-gradient(ellipse 62% 70% at 50% 40%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.62) 100%)'}} /> : null}
  </AbsoluteFill>
);
