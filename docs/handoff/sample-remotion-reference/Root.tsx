import React from 'react';
import {Composition} from 'remotion';
import {Sample} from './Sample';
import plan from './plan.json';
export const RemotionRoot: React.FC = () => (
  <Composition id="Sample" component={Sample} fps={30} width={1920} height={1080}
    durationInFrames={Math.round(plan.meta.duration * 30)} defaultProps={{plan}} />
);
