import {ReferenceLayer} from './ReferenceLayer';
import {activeScene,sceneEnvelope,projectScenes} from './reference-motion.mjs';
import {KnowledgeLayer,ChapterBar} from './KnowledgeLayer';
import {speakerBox,type Presentation} from './presentation.mjs';
import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Video, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate, getRemotionEnvironment} from 'remotion';
import {MotionLayer} from './MotionLayer';
import {CaptionTrack} from './CaptionTrack';
import {BrollLayer, projectBrolls, type BrollItem} from './Broll';
import {projectCaptions, type Caption} from './captions';
import {placeClips, sampleTransform, totalDurationFrames, type Clip, type Music} from './timeline';

// one clip's media with its keyframed zoom/pan transform applied
const ClipMedia: React.FC<{clip: Clip; durFrames: number; Comp: React.ElementType; captions: Caption[];presentation?:Presentation}> = ({clip, durFrames, Comp, captions,presentation}) => {
  const {fps,width,height} = useVideoConfig();
  const frame = useCurrentFrame(); // relative to this clip's Sequence
  const speed = clip.speed ?? 1;
  // keyframe times are source-relative → advance source-time at `speed`
  const {scale:manualScale, x, y} = sampleTransform(clip.transform, clip.inSec + (frame / fps) * speed);
  const srcMs=(clip.inSec+(frame/fps)*speed)*1000;
  const emphasis=captions.find(c=>c.clipId===clip.id&&c.motion?.kind==='emphasis'&&srcMs>=c.startMs&&srcMs<c.endMs);
  const ease=emphasis ? Math.max(0,Math.min(1,(srcMs-emphasis.startMs)/300,(emphasis.endMs-srcMs)/300)) : 0;
  const scale=manualScale*(1+((emphasis?.motion?.zoom??1.09)-1)*ease);
  const inset=captions.some(c=>c.clipId===clip.id && (c.motion?.kind==='steps'||c.motion?.kind==='compare'||c.motion?.kind==='number'||c.motion?.kind==='card') && srcMs>=c.startMs && srcMs<c.endMs);
  const active=presentation?.style==='reference'?activeScene(captions,srcMs,clip.id):captions.find(c=>c.clipId===clip.id&&c.motion&&srcMs>=c.startMs&&srcMs<c.endMs);
  const target=speakerBox(active?.motion?.layout??'speaker',width,height),full=speakerBox('speaker',width,height);
  const amount=active?Math.max(0,Math.min(1,(srcMs-active.startMs)/240,((active.motion?.holdEndMs??active.endMs)-srcMs)/240)):0;
  let box=Object.fromEntries(Object.keys(full).map(k=>[k,full[k as keyof typeof full]+(target[k as keyof typeof full]-full[k as keyof typeof full])*amount]));
  if(presentation?.style==='reference'&&active){
   const siblings=captions.filter(c=>c.motion&&c.clipId===active.clipId&&c.id!==active.id);
   const previous=siblings.find(c=>Math.abs((c.motion?.holdEndMs??c.endMs)-active.startMs)<1),next=siblings.find(c=>Math.abs(c.startMs-(active.motion?.holdEndMs??active.endMs))<1);
   const origin=previous?speakerBox(previous.motion?.layout??'speaker',width,height):full,env=sceneEnvelope(srcMs,active.startMs,active.motion?.holdEndMs??active.endMs,presentation.motionPace);
   box=Object.fromEntries(Object.keys(full).map(k=>{const key=k as keyof typeof full;const v=origin[key]+(target[key]-origin[key])*env.enter;return [k,full[key]+(v-full[key])*(next?1:env.exit)];}));
  }
  const trimBefore = Math.round(clip.inSec * fps);
  return (
    <div
      data-ab={`clip:${clip.id}`}
      style={presentation?.theme==='knowledge'?{position:'absolute',left:box.left,top:box.top,width:box.width,height:box.height,borderRadius:box.radius,overflow:'hidden',boxShadow:amount>.9&&active?.motion?.layout!=='headline'?'0 14px 55px #0005':undefined}:{position:'absolute', width: inset ? '42%' : '100%', height: inset ? '34%' : '100%', left: inset ? '29%' : 0, top: inset ? '43%' : 0, borderRadius: inset ? 32 : 0, overflow: 'hidden'}}
    >
      <div style={{width:'100%',height:'100%',transform:`scale(${scale})`,transformOrigin:'center'}}>
      <Comp
        src={staticFile(clip.src)}
        playbackRate={speed}
        trimBefore={trimBefore}
        // source frames consumed = timeline frames × speed (keeps the trimmed
        // span exactly as long as the Sequence — no black tail frame)
        trimAfter={trimBefore + Math.round(durFrames * speed)}
        acceptableTimeShiftInSeconds={0.5}
        muted={clip.muted || (clip.volume ?? 1) === 0}
        volume={clip.muted ? 0 : clip.volume ?? 1}
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${50-x}% ${50-y}%`}}
      />
      </div>
    </div>
  );
};

// Music layer: start offset, volume, optional end fade-out, and optional
// auto-ducking — the music dips while someone is speaking (speech = caption spans).
const MusicTrack: React.FC<{music: NonNullable<Music>; totalFrames: number; speech: Array<[number, number]>}> = ({music, totalFrames, speech}) => {
  const {fps} = useVideoConfig();
  const fadeFrames = Math.round((music.fadeOutSec ?? 0) * fps);
  const DUCK_RAMP_MS = 250; // ease the dip in/out
  return (
    <Audio
      src={staticFile(music.src)}
      trimBefore={Math.round((music.startSec ?? 0) * fps)}
      volume={(f) => {
        let v =
          fadeFrames > 0
            ? interpolate(f, [totalFrames - fadeFrames, totalFrames], [music.volume, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            : music.volume;
        if (music.duck && speech.length) {
          const ms = (f / fps) * 1000;
          let dist = Infinity; // distance to the nearest speech span (0 = inside)
          for (const [a, b] of speech) {
            if (ms >= a && ms <= b) { dist = 0; break; }
            dist = Math.min(dist, ms < a ? a - ms : ms - b);
          }
          const k = Math.min(1, dist / DUCK_RAMP_MS); // 0 in speech → ducked, 1 far away
          const duckLevel = music.duckLevel ?? 0.25;
          v *= duckLevel + (1 - duckLevel) * k;
        }
        return v;
      }}
    />
  );
};

export const MultiClipVideo: React.FC<{
  clips?: Clip[];
  music?: Music;
  captions?: Caption[];
  brolls?: BrollItem[];
  accentColor?: string;
  presentation?:Presentation;
}> = ({clips = [], music = null, captions = [], brolls = [], accentColor,presentation}) => {
  const {fps} = useVideoConfig();
  const placed = placeClips(clips, fps);
  const totalFrames = totalDurationFrames(clips, fps);
  // captions + b-roll are anchored to clips (source-relative) → project to absolute
  const projectedCaptions = projectCaptions(captions, clips, fps);
  const visualScenes=presentation?.style==='reference'?projectScenes(captions,clips,fps):projectedCaptions;
  const projectedBrolls = projectBrolls(brolls, clips, fps);

  // OffthreadVideo is built for rendering (frame-accurate, but stutters/freezes
  // in the live Player). Use native <Video> in preview for smooth playback,
  // OffthreadVideo only when actually rendering the mp4.
  const Clip = getRemotionEnvironment().isRendering ? OffthreadVideo : Video;

  return (
    <AbsoluteFill style={{background:presentation?.style==='reference'?'linear-gradient(#ffffff0b 1px,transparent 1px),linear-gradient(90deg,#ffffff0b 1px,transparent 1px),radial-gradient(ellipse at 0% 100%,#0d245f,transparent 65%),radial-gradient(ellipse at 100% 0%,#914114,transparent 58%),#080b13':presentation?.theme==='knowledge'?'radial-gradient(ellipse at 0% 100%,#142b63,transparent 70%),radial-gradient(ellipse at 100% 0%,#72381d,transparent 65%),#080b13':'#10180e',backgroundSize:presentation?.style==='reference'?'80px 80px,80px 80px,auto,auto,auto':undefined}}>
      {presentation?.theme==='knowledge'&&<KnowledgeLayer captions={visualScenes} presentation={presentation}/>}
      {/* clip layer — trimmed takes back-to-back, with keyframed zoom/pan */}
      {placed.map(({clip, fromFrame, durFrames}) => (
        <Sequence
          key={clip.id}
          from={fromFrame}
          durationInFrames={durFrames}
          // premount upcoming clips (hidden) so the <video> is decoded before the
          // cut — kills the black flash at segment seams in the preview
          premountFor={Math.round(fps)}
          name={clip.label ?? clip.id}
        >
          <ClipMedia clip={clip} durFrames={durFrames} Comp={Clip} captions={captions} presentation={presentation} />
        </Sequence>
      ))}

      {/* B-roll overlay (above clips, below captions) */}
      <BrollLayer items={projectedBrolls} />

      {presentation?.theme!=='knowledge'&&<MotionLayer captions={projectedCaptions} accentColor={accentColor} />}

      {presentation?.style==='reference'&&<ReferenceLayer captions={visualScenes} presentation={presentation} plane="foreground"/>}

      {/* music */}
      {music && <MusicTrack music={music} totalFrames={totalFrames} speech={projectedCaptions.map((c) => [c.startMs, c.endMs])} />}

      {/* captions, always on top */}
      <CaptionTrack captions={projectedCaptions} accentColor={presentation?.theme==='knowledge'?'#f1ff27':accentColor} reference={presentation?.style==='reference'} />
      {presentation?.theme==='knowledge'&&<ChapterBar presentation={presentation} clips={clips} totalFrames={totalFrames}/>} 
    </AbsoluteFill>
  );
};
