import {presentationSize,type Presentation} from './presentation.mjs';
import React from 'react';
import {Composition, staticFile} from 'remotion';
import {MultiClipVideo} from './MultiClipVideo';
import {totalDurationFrames} from './timeline';

// The editor renders MultiClipVideo via @remotion/player; this composition is
// what `remotion render` exports. Props come straight from the editor on export;
// in Studio they fall back to the files on disk.
export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="MultiClip"
      component={MultiClipVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{clips: [], music: null, captions: [], brolls: [], accentColor: '#FFB020'}}
      calculateMetadata={async ({props}) => {
        const fps = 30;
        const p = props as {clips?: unknown; music?: unknown; captions?: unknown; brolls?: unknown};
        const tl =
          Array.isArray(p.clips)
            ? {clips: p.clips, music: p.music ?? null}
            : await fetch(staticFile('timeline.json')).then((r) => r.json()).catch(() => ({clips: [], music: null}));
        const captions =
          Array.isArray(p.captions)
            ? p.captions
            : await fetch(staticFile('captions.multi.json')).then((r) => r.json()).catch(() => []);
        const brolls =
          Array.isArray(p.brolls)
            ? p.brolls
            : await fetch(staticFile('broll.json')).then((r) => r.json()).catch(() => []);
        return {
          fps,
          ...presentationSize(props.presentation as Presentation|undefined),
          durationInFrames: totalDurationFrames(tl.clips, fps),
          props: {...props, clips: tl.clips, music: tl.music, captions, brolls},
        };
      }}
    />
    <Composition
      id="ReferencePreview" component={MultiClipVideo}
      fps={30} width={1920} height={1080} durationInFrames={1}
      defaultProps={{clips: [], captions: [], brolls: [], music: null}}
      calculateMetadata={async () => {
        const project=await fetch(staticFile("preview-project.json")).then(r=>{if(!r.ok)throw Error("No local preview project");return r.json();}).catch(()=>({clips:[],captions:[],brolls:[],music:null}));
        return {fps:30,...presentationSize(project.presentation),durationInFrames:Math.max(1,totalDurationFrames(project.clips??[],30)),props:project};
      }}
    />
    </>
  );
};
