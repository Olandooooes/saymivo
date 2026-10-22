import React from 'react';
import {staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Clip} from './timeline';
import {focusWindowSample, retainedFocusWindows} from './clip-focus-windows.mjs';

// Kept in the clip's existing Sequence: mounting an active callout must not
// restart source time. Only the original base video supplies audio.
export function ClipFocusWindows({clip, Comp}: {clip: Clip; Comp: React.ElementType}) {
  const frame = useCurrentFrame(), {fps, width, height} = useVideoConfig();
  return <>{retainedFocusWindows(clip).map(window => {
    const sample = focusWindowSample(clip, window, frame, fps, width, height);
    if (!sample) return null;
    return <div key={window.id} data-clip-focus={window.id} style={{position: 'absolute', ...sample.box,
      overflow: 'hidden', borderRadius: 10, opacity: sample.opacity, pointerEvents: 'none',
      boxShadow: '0 0 0 1.5px #abc1ffb3, 0 12px 32px #11192a45'}}>
      <Comp src={staticFile(clip.src)} {...sample.playback} acceptableTimeShiftInSeconds={.5}
        style={{position: 'absolute', ...sample.crop, maxWidth: 'none', objectFit: 'fill'}} />
    </div>;
  })}</>;
}
