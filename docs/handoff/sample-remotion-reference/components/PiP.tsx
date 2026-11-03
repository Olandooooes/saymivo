import React from 'react';
import {OffthreadVideo, staticFile} from 'remotion';
import {ORANGE} from '../theme';
export const PiP: React.FC<{src: string; size?: number; right?: number; bottom?: number}> = ({src, size = 300, right = 60, bottom = 86}) => {
  const vw = size * 2.25; const vh = vw * 9 / 16;
  return (
    <div style={{position: 'absolute', right, bottom, width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `6px solid #fff`,
      boxShadow: `0 0 0 5px ${ORANGE}, 0 18px 40px rgba(0,0,0,0.35)`, background: '#222'}}>
      <OffthreadVideo src={staticFile(src)} muted style={{position: 'absolute', width: vw, height: vh, left: size / 2 - vw * 0.5, top: size / 2 - vh * 0.56}} />
    </div>
  );
};
