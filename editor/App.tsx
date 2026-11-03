import React, {useEffect, useState} from 'react';
import {useEditor} from './store';
import {Editor} from './Editor';
import {Start, type ProjectMeta, type ManualProjectSettings} from './Start';
import {displayFontConfig} from '../src/display-fonts.mjs';
import {validEmphasisTheme, type EmphasisTheme} from '../src/emphasis-theme.mjs';

const META0 = {durationInFrames: 1, fps: 30, width: 1080, height: 1920};

// Top-level: Start screen is the home (new project + recent projects library).
// Opening or creating a project switches to the editor.
export const App: React.FC = () => {
  const {init, setProjectInfo} = useEditor();
  const [view, setView] = useState<'start' | 'editor'>('start');
  const [projects, setProjects] = useState<ProjectMeta[]>([]);

  const refresh = () =>
    fetch('/api/projects').then((r) => r.json()).then((l) => setProjects(Array.isArray(l) ? l : [])).catch(() => setProjects([]));

  // start with an empty project so the Start screen's uploads can compute meta
  useEffect(() => {
    init(META0, [], undefined, [], null, []);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProject = async (id: string) => {
    try {
      const p = await fetch('/api/projects/' + id).then((r) => r.json());
      init(META0, p.captions ?? [], p.accentColor, p.clips ?? [], p.music ?? null, p.brolls ?? [], p.brollAssets ?? [],p.presentation);
      setProjectInfo(id, p.name || '未命名口播');
      setView('editor');
    } catch {
      /* ignore */
    }
  };

  // new project: Start already populated clips via upload; assign an id and go
  const newProject = (options: ManualProjectSettings) => {
    const state = useEditor.getState();
    state.setPresentation({...state.presentation, format: options.format, canvas: undefined,
      theme: options.template === 'classic' ? 'classic' : 'knowledge',
      style: options.template === 'reference' ? 'reference' : 'clean',
      displayFont: displayFontConfig(options.displayFont)?.id,
      emphasisTheme: validEmphasisTheme(options.emphasisTheme) ? options.emphasisTheme as EmphasisTheme : undefined,
      motionPace: options.motionPace === 'calm' || options.motionPace === 'brisk' ? options.motionPace : 'balanced'});
    setProjectInfo(`p-${Date.now()}`, '未命名口播');
    setView('editor');
  };

  const backToStart = async () => {
    const s=useEditor.getState();
    if(s.projectId){const r=await fetch('/api/projects/'+s.projectId,{method:'POST',body:JSON.stringify({name:s.projectName,clips:s.clips,music:s.music,captions:s.captions,brolls:s.brolls,brollAssets:s.brollAssets,accentColor:s.accentColor,presentation:s.presentation})});if(!r.ok){alert('保存失败，请稍后再返回项目库。');return;}}

    init(META0, [], undefined, [], null, []); // clear for a fresh start
    refresh();
    setView('start');
  };

  if (view === 'start') return <Start projects={projects} onNew={newProject} onOpen={openProject} onRefresh={refresh} onDemo={async () => { const res = await fetch('/api/demo', {method: 'POST'}); const data = await res.json(); if (res.ok) openProject(data.id); else alert(data.error || '演示工程创建失败'); }} />;
  return <Editor onBackToStart={backToStart} />;
};
