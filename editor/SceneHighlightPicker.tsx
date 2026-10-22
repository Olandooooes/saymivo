import React, {useEffect, useRef, useState} from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
import {MediaRegionPicker} from './MediaRegionPicker';
import {sceneHighlightBoxPatch, sceneHighlightColorPatch, sceneHighlightPreviewSecond} from './scene-highlight-edit.mjs';

export function SceneHighlightPicker({scene, onChange}: {
  scene: StoryScene;
  onChange: (patch: Partial<StoryScene>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(scene.highlights?.[0]?.id ?? '');
  const [previewTime, setPreviewTime] = useState(() => sceneHighlightPreviewSecond(scene, selectedId));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const region = scene.highlights?.find(highlight => highlight.id === selectedId);
  const media = scene.media;
  const seekPreview = () => {
    const element = video.current;
    if (!element || element.readyState < 1) return;
    element.pause();
    const end = Number.isFinite(element.duration) ? Math.max(0, element.duration - .001) : previewTime;
    const second = Math.max(0, Math.min(previewTime, end));
    if (Math.abs(element.currentTime - second) > .001) {
      setReady(false);
      element.currentTime = second;
    } else setReady(element.readyState >= 2);
  };
  useEffect(() => {
    setPreviewTime(sceneHighlightPreviewSecond(scene, selectedId));
  }, [scene.id, media?.src, media?.startSec, media?.freezeAtSec, media?.rate, selectedId, region?.atMs]);
  useEffect(() => {setError('');setReady(false);}, [media?.src, open]);
  useEffect(seekPreview, [previewTime, open, media?.src]);
  if (!media) return null;
  const mode = region?.mode ?? (scene.layout === 'spotlight' ? 'spotlight' : 'highlight');
  const colorEditable = mode === 'highlight' || mode === 'underline';
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>直接在素材上框选高亮</summary>
    {open && <>
      <p className="muted">在原始素材上框选；成片中的裁切、放大和倾斜会同时作用于素材与标记。</p>
      <button type="button" onClick={() => {
        const id = 'focus-' + Date.now();
        onChange({highlights: [...(scene.highlights ?? []), {id, x: .1, y: .25, w: .6, h: .08, atMs: 0}]});
        setSelectedId(id);
      }}>添加并框选新高亮</button>
      {media.kind === 'video' && <label>查看素材时间（秒）
        <input aria-label={'高亮取帧秒 ' + scene.id} type="number" min="0" step=".1"
          max={media.durationSec} value={Number(previewTime.toFixed(3))}
          onChange={event => {const value = Number(event.target.value);if (Number.isFinite(value)) setPreviewTime(Math.max(0, value));}}/>
      </label>}
      <MediaRegionPicker src={media.src} regions={(scene.highlights ?? []).map((highlight, index) => ({
        ...highlight, cue: '高亮 ' + (index + 1) + ' · ' + (highlight.atMs / 1000).toFixed(2) + 's',
      }))} selectedId={selectedId} onSelectedIdChange={setSelectedId}
        targetLabel={'分镜框选目标 ' + scene.id} drawLabel="在素材上重画区域"
        drawingHint="拖出目标区域，松开应用；Esc取消。本次只调整当前高亮的位置与大小。"
        disabled={media.kind === 'video' && !ready}
        preview={media.kind === 'video' ? <video key={media.src} ref={video} src={'/' + media.src}
          aria-label={'高亮素材暂停帧 ' + scene.id} preload="metadata" muted playsInline controls={false}
          disablePictureInPicture tabIndex={-1} onLoadedMetadata={seekPreview}
          onLoadedData={event => setReady(!event.currentTarget.seeking)}
          onSeeked={event => setReady(event.currentTarget.readyState >= 2)}
          onPlay={event => event.currentTarget.pause()}
          onError={() => {setError('素材视频无法读取，请检查文件。');setReady(false);}}
          style={{width: '100%', height: 'auto', display: 'block', pointerEvents: 'none'}}/> : undefined}
        onChange={(id, box) => {const patch = sceneHighlightBoxPatch(scene, id, box);if (patch) onChange(patch);}}/>
      {error && <p role="status">{error}</p>}
      {region && <label>{colorEditable ? '当前高亮颜色' : mode === 'selection' ? '选区使用蓝色' : '聚光边框使用白色'}
        <input aria-label={'高亮颜色 ' + region.id} type="color" disabled={!colorEditable}
          value={colorEditable ? region.color ?? '#efff24' : mode === 'selection' ? '#8ac8ff' : '#ffffff'}
          onChange={event => {const patch = sceneHighlightColorPatch(scene, region.id, event.target.value);if (patch) onChange(patch);}}/>
      </label>}
    </>}
  </details>;
}
