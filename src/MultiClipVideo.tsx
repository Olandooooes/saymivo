import {TalkingMotionLayer} from './TalkingMotionLayer';
import {DynamicMotionLayer} from './DynamicMotionLayer';
import {AudioClockPlayback,useAudioClockMixer} from './AudioClockPlayback';
import {registerAudioClockMediaElement} from './audio-clock-integration.mjs';
import {emphasisThemeVars} from './emphasis-theme.mjs';
import {displayFontFamily} from './display-fonts.mjs';
import {DisplayFontContext,useDisplayFont} from './DisplayFont';
import {EmbeddedTitle} from './EmbeddedTitle';
import {ClipFocusWindows} from './ClipFocusWindows';
import {captionsForVisibleClips} from './clip-focus-windows.mjs';
import {StoryboardLayer} from './StoryboardLayer';
import {activeStoryboard,projectStoryboard,previousStoryboardScene,sampleSceneWindow,sceneSpeakerLayout} from './storyboard.mjs';
import {ReferenceLayer} from './ReferenceLayer';
import {activeScene,sceneEnvelope,projectScenes} from './reference-motion.mjs';
import {KnowledgeLayer} from './KnowledgeLayer';
import {speakerBox,type Presentation} from './presentation.mjs';
import React,{useRef,useLayoutEffect} from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Video, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate, getRemotionEnvironment} from 'remotion';
import {MotionLayer} from './MotionLayer';
import {CaptionTrack} from './CaptionTrack';
import {BrollLayer, projectBrolls, type BrollItem} from './Broll';
import {projectCaptions, type Caption} from './captions';
import {placeClips, sampleTransform, totalDurationFrames, type Clip, type Music} from './timeline';

const easeOutScene=(t:number)=>1-(1-Math.max(0,Math.min(1,t)))**3;

// one clip's media with its keyframed zoom/pan transform applied
const ClipMedia: React.FC<{clip: Clip; durFrames: number; Comp: React.ElementType; captions: Caption[];presentation?:Presentation;authoredScenes:ReturnType<typeof projectStoryboard>}> = ({clip, durFrames, Comp, captions,presentation,authoredScenes}) => {
  const {fps,width,height} = useVideoConfig();
  const frame = useCurrentFrame(); // relative to this clip's Sequence
  const audioMixer=useAudioClockMixer();
  const speed = clip.speed ?? 1;
  // keyframe times are source-relative → advance source-time at `speed`
  const {scale:manualScale, x, y} = sampleTransform(clip.transform, clip.inSec + (frame / fps) * speed);
  const srcMs=(clip.inSec+(frame/fps)*speed)*1000;
  const emphasis=captions.find(c=>c.clipId===clip.id&&c.motion?.kind==='emphasis'&&srcMs>=c.startMs&&srcMs<c.endMs);
  const ease=emphasis ? Math.max(0,Math.min(1,(srcMs-emphasis.startMs)/300,(emphasis.endMs-srcMs)/300)) : 0;
  const scale=manualScale*(1+((emphasis?.motion?.zoom??1.09)-1)*ease);
  const inset=captions.some(c=>c.clipId===clip.id && (c.motion?.kind==='steps'||c.motion?.kind==='compare'||c.motion?.kind==='number'||c.motion?.kind==='card') && srcMs>=c.startMs && srcMs<c.endMs);
  const authored=activeStoryboard(presentation?.scenes,srcMs,clip);
  const active=presentation?.style==='reference'?activeScene(captions,srcMs,clip.id):captions.find(c=>c.clipId===clip.id&&c.motion&&srcMs>=c.startMs&&srcMs<c.endMs);
  const layout=authored?.layout??active?.motion?.layout??'speaker';
  const overlayHeadline=layout==='headline'&&authored?.headlinePosition&&authored.headlinePosition!=='left';
  const speakerLayout=authored?sceneSpeakerLayout(authored):overlayHeadline?'speaker':['chapter','outro'].includes(layout)?'headline':['cards','flow','demo'].includes(layout)?'slide':layout;
  let target=speakerBox(speakerLayout,width,height);const full=speakerBox('speaker',width,height);
  const currentWindow=sampleSceneWindow(authored,authored?srcMs-authored.startMs:0);
  if(currentWindow&&speakerLayout==='slide'){const size=width*currentWindow.size;target={left:width*currentWindow.x,top:height*currentWindow.y,width:size,height:size,radius:size/2};}
  const amount=active?Math.max(0,Math.min(1,(srcMs-active.startMs)/240,((active.motion?.holdEndMs??active.endMs)-srcMs)/240)):0;
  let box=Object.fromEntries(Object.keys(full).map(k=>[k,full[k as keyof typeof full]+(target[k as keyof typeof full]-full[k as keyof typeof full])*amount]));
  if(presentation?.style==='reference'&&active){
   const siblings=captions.filter(c=>c.motion&&c.clipId===active.clipId&&c.id!==active.id);
   const previous=siblings.find(c=>Math.abs((c.motion?.holdEndMs??c.endMs)-active.startMs)<1),next=siblings.find(c=>Math.abs(c.startMs-(active.motion?.holdEndMs??active.endMs))<1);
   const origin=previous?speakerBox(previous.motion?.layout??'speaker',width,height):full,env=sceneEnvelope(srcMs,active.startMs,active.motion?.holdEndMs??active.endMs,presentation.motionPace);
   box=Object.fromEntries(Object.keys(full).map(k=>{const key=k as keyof typeof full;const v=origin[key]+(target[key]-origin[key])*env.enter;return [k,full[key]+(v-full[key])*(next?1:env.exit)];}));
  }
  let previousFraming=authored?.speaker,framingPace=1,continuousTitleBackdrop=false;
  if(presentation?.scenes?.length){
    const pace=authored?(authored.transitionMs===0?1:easeOutScene((srcMs-authored.startMs)/(authored.transitionMs??200))):1;
    const current=authoredScenes.find(s=>s.sourceId===authored?.id&&s.clipId===clip.id);
    const previous=previousStoryboardScene(authoredScenes,current);
    let old=speakerBox(sceneSpeakerLayout(previous),width,height);
    const previousWindow=sampleSceneWindow(previous,previous?(previous.endMs-(previous.phaseStartMs??previous.startMs))*(previous.speed??1):0);
    if(previousWindow&&sceneSpeakerLayout(previous)==='slide'){const size=width*previousWindow.size;old={left:width*previousWindow.x,top:height*previousWindow.y,width:size,height:size,radius:size/2};}
    box=Object.fromEntries(Object.keys(full).map(k=>[k,old[k as keyof typeof old]+(target[k as keyof typeof target]-old[k as keyof typeof old])*pace]));
    // Airy titles move the same continuous shot into/out of the text area.
    // Cross-dissolving two different crops here creates two visible faces.
    const continuousTitleMove=(authored?.titleTreatment==='airy'||previous?.titleTreatment==='airy')&&['speaker','editorial'].includes(speakerLayout)&&['speaker','editorial'].includes(sceneSpeakerLayout(previous));
    continuousTitleBackdrop=continuousTitleMove&&(pace<1||authored?.titleTreatment==='airy');
    // Keep one live video while its window changes size and shape. Two
    // simultaneous crops create a second face over the incoming lecture.
    if(previous&&previous.src===clip.src){previousFraming=previous.speaker;framingPace=pace;}
  }
  const destinationFraming={x:50,y:50,scale:1,shiftY:0,...presentation?.speaker,...authored?.speaker};
  const originFraming={x:50,y:50,scale:1,shiftY:0,...presentation?.speaker,...previousFraming};
  const frameStyle={...destinationFraming};
  for(const key of ['x','y','scale','shiftY'] as const)frameStyle[key]=originFraming[key]+(destinationFraming[key]-originFraming[key])*framingPace;
  const trimBefore = Math.round(clip.inSec * fps);
  const drawSpeaker=(box:Record<string,number>,framing:typeof frameStyle,silent=false,opacity=1)=>(
    <div
      data-ab={silent?undefined:`clip:${clip.id}`}
      data-audio-original-track={silent?undefined:clip.id}
      style={presentation?.theme==='knowledge'||authored?.visualPreset?{position:'absolute',opacity,left:box.left,top:box.top,width:box.width,height:box.height,borderRadius:box.radius,overflow:'hidden',boxShadow:amount>.9&&active?.motion?.layout!=='headline'?'0 14px 55px #0005':undefined}:{position:'absolute', width: inset ? '42%' : '100%', height: inset ? '34%' : '100%', left: inset ? '29%' : 0, top: inset ? '43%' : 0, borderRadius: inset ? 32 : 0, overflow: 'hidden'}}
    >
      <div style={{width:'100%',height:'100%',transform:`translateY(${framing.shiftY}%) scale(${scale*framing.scale})`,transformOrigin:'center'}}>
      <Comp
        src={staticFile(clip.src)}
        playbackRate={speed}
        trimBefore={trimBefore}
        // source frames consumed = timeline frames × speed (keeps the trimmed
        // span exactly as long as the Sequence — no black tail frame)
        trimAfter={trimBefore + Math.round(durFrames * speed)}
        acceptableTimeShiftInSeconds={0.5}
        muted={audioMixer.forceMuteOriginal || silent || clip.muted || (clip.volume ?? 1) === 0}
        volume={audioMixer.forceMuteOriginal || silent || clip.muted ? 0 : clip.volume ?? 1}
        style={{width: '100%', height: '100%', objectFit: clip.fit ?? 'cover', objectPosition: `${framing.x-x}% ${framing.y-y}%`}}
      />
      {authored&&!authored.dynamicMotion&&(authored.visualPreset?authored.visualPreset.id==='person-backdrop':authored.titleTreatment==='embedded')&&<EmbeddedTitle scene={authored} sourceMs={srcMs} width={width} height={height}/>}
      </div>
    </div>
  );
  return <>{continuousTitleBackdrop&&<AbsoluteFill style={{background:'#f5f3ec'}}/>}<div style={{position:'absolute',inset:0,opacity:authored?.dynamicMotion?0:1}}>{drawSpeaker(box,frameStyle)}</div>{!authored?.dynamicMotion&&<ClipFocusWindows clip={clip} Comp={Comp}/>}</>;
};

// Music layer: start offset, volume, optional end fade-out, and optional
// auto-ducking — the music dips while someone is speaking (speech = caption spans).
const MusicTrack: React.FC<{music: NonNullable<Music>; totalFrames: number; speech: Array<[number, number]>}> = ({music, totalFrames, speech}) => {
  const {fps} = useVideoConfig();
  const audioMixer=useAudioClockMixer(),slot=useRef<HTMLSpanElement>(null),audio=useRef<HTMLAudioElement>(null);
  useLayoutEffect(()=>registerAudioClockMediaElement(slot.current,audio.current),[music.src]);
  const fadeFrames = Math.round((music.fadeOutSec ?? 0) * fps);
  const DUCK_RAMP_MS = 250; // ease the dip in/out
  return (
    <span ref={slot} data-audio-music-track="true"><Audio ref={audio}
      muted={audioMixer.forceMuteMusic}
      src={staticFile(music.src)}
      trimBefore={Math.round((music.startSec ?? 0) * fps)}
      volume={(f) => {
        if(audioMixer.forceMuteMusic)return 0;
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
    /></span>
  );
};

export const MultiClipVideo: React.FC<{
  clips?: Clip[];
  music?: Music;
  captions?: Caption[];
  brolls?: BrollItem[];
  accentColor?: string;
  presentation?:Presentation;
  brollAssets?:unknown[];
}> = ({clips = [], music = null, captions = [], brolls = [], accentColor,presentation,brollAssets=[]}) => {
  const {fps,width,height} = useVideoConfig();
  const frame=useCurrentFrame();
  useDisplayFont(presentation?.displayFont);
  const placed = placeClips(clips, fps);
  const totalFrames = totalDurationFrames(clips, fps);
  // captions + b-roll are anchored to clips (source-relative) → project to absolute
  const projectedCaptions = projectCaptions(captions, clips, fps);
  const authoredScenes=projectStoryboard(presentation?.scenes,clips,fps);
  const presetActive=authoredScenes.some(scene=>(scene.visualPreset||scene.dynamicMotion)&&frame/fps*1000>=scene.startMs&&frame/fps*1000<scene.endMs);
  const visualScenes=presentation?.style==='reference'?projectScenes(captions,clips,fps):projectedCaptions;
  const displayCaptions=projectedCaptions.map(c=>authoredScenes.some(s=>s.layout==='headline'&&s.headlinePosition==='split'&&c.startMs>=s.startMs&&c.startMs<s.endMs)?{...c,topPct:86,scale:.62}:c);
  const projectedBrolls = projectBrolls(brolls, clips, fps);

  // OffthreadVideo is built for rendering (frame-accurate, but stutters/freezes
  // in the live Player). Use native <Video> in preview for smooth playback,
  // OffthreadVideo only when actually rendering the mp4.
  const Clip = getRemotionEnvironment().isRendering ? OffthreadVideo : Video;

  return (
    <DisplayFontContext.Provider value={presentation?.displayFont}><AudioClockPlayback scenes={presentation?.scenes??[]} clips={clips} brollAssets={brollAssets} validationState={{clips,presentation:presentation??null,accentColor,meta:{fps,width,height,durationInFrames:totalFrames},captions,brolls,music,brollAssets}}><AbsoluteFill data-video-composition="true" style={{...({...emphasisThemeVars(presentation?.emphasisTheme),'--koubo-display-font':displayFontFamily(presentation?.displayFont),'--koubo-cjk-width':presentation?.displayFont==='smiley'?.82:1} as React.CSSProperties),lineHeight:'normal',background:presentation?.style==='reference'?'linear-gradient(#ffffff0b 1px,transparent 1px),linear-gradient(90deg,#ffffff0b 1px,transparent 1px),radial-gradient(ellipse at 0% 100%,#0d245f,transparent 65%),radial-gradient(ellipse at 100% 0%,var(--koubo-corner-glow),transparent 58%),#080b13':presentation?.theme==='knowledge'?'radial-gradient(ellipse at 0% 100%,#142b63,transparent 70%),radial-gradient(ellipse at 100% 0%,#72381d,transparent 65%),#080b13':'#10180e',backgroundSize:presentation?.style==='reference'?'80px 80px,80px 80px,auto,auto,auto':undefined}}>
      <style>{'[data-video-composition] * { box-sizing: content-box; }'}</style>
      {presentation?.theme==='knowledge'&&!presentation.scenes?.length&&<KnowledgeLayer captions={visualScenes} presentation={presentation}/>}
      {presentation?.scenes?.length?<StoryboardLayer scenes={authoredScenes}/>:null}
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
          <ClipMedia clip={clip} durFrames={durFrames} Comp={Clip} captions={captions} presentation={presentation} authoredScenes={authoredScenes} />
        </Sequence>
      ))}

      {/* B-roll overlay (above clips, below captions) */}
      <BrollLayer items={projectedBrolls} />

      {presentation?.theme!=='knowledge'&&!presetActive&&<MotionLayer captions={projectedCaptions} accentColor={accentColor} />}

      {presentation?.style==='reference'&&!presentation.scenes?.length&&<ReferenceLayer captions={visualScenes} presentation={presentation} plane="foreground"/>}

      {presentation?.scenes?.length?<StoryboardLayer scenes={authoredScenes} plane="foreground"/>:null}
      {presentation?.scenes?.some(scene=>scene.dynamicMotion)&&<DynamicMotionLayer scenes={presentation.scenes} clips={clips} presentation={presentation} accentColor={accentColor} meta={{fps,width,height,durationInFrames:totalFrames}} context={{captions,brolls,music,brollAssets}}/>}
      {/* music */}
      {music && <MusicTrack music={music} totalFrames={totalFrames} speech={projectedCaptions.map((c) => [c.startMs, c.endMs])} />}

      {presentation?.talkingMotion?.length?<TalkingMotionLayer cues={presentation.talkingMotion} captions={captions} clips={clips} accentColor={accentColor??'#d8f99a'}/>:null}
      {/* captions, always on top */}
      <CaptionTrack globalStyle={presentation?.captionStyle} captions={captionsForVisibleClips(displayCaptions, clips)} accentColor={presentation?.theme==='knowledge'?'#f1ff27':accentColor} reference={presentation?.style==='reference'} minimal={presentation?.scenes?.some(s=>s.titleTreatment==='airy')} />
    </AbsoluteFill></AudioClockPlayback></DisplayFontContext.Provider>
  );
};
