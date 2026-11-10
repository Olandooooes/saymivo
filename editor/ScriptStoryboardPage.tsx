import React, {useEffect, useRef, useState} from 'react';
import type {Caption} from '../src/captions';
import {
  EMPHASIS_STYLES,
  MOTIONS,
  ROLES,
  addShot,
  captionsToDraftInput,
  draftScriptStoryboard,
  mergeShots,
  missingAssetShots,
  rematchAssets,
  removeShot,
  splitShot,
  updateShot,
  validateScriptStoryboard,
  type MotionKind,
  type ScriptStoryboard,
  type ShotRole,
} from '../src/script-storyboard.mjs';
import './whiteboard.css';

type Asset = {
  id: string;
  title: string;
  category: string;
  type: string;
  keywords: string[];
  usages: string[];
  source: string;
  prompt: string;
  deprecated: boolean;
  thumb: string;
  path: string;
};
type EditResult = {ok: true; storyboard: ScriptStoryboard} | {ok: false; error: string};

const placeholder = '在这里贴口播稿。系统按句号、问号、叹号和换行拆成镜头，再按素材库关键词做一版匹配。';

export const ScriptStoryboardPage: React.FC<{projectId: string | null; captions: Caption[]; onClose: () => void}> = ({projectId, captions, onClose}) => {
  const [doc, setDoc] = useState<ScriptStoryboard | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [libraryNote, setLibraryNote] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在读取已保存的分镜…');
  const [error, setError] = useState('');
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const skipSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/asset-library?deprecated=1')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setAssets(payload.items ?? []);
        setLibraryReady(true);
        setLibraryNote(payload.ok ? '' : (payload.message || '素材库还不可用，分镜仍可编辑，配图会先记为缺素材。'));
      })
      .catch(() => { if (!cancelled) { setLibraryReady(true); setLibraryNote('素材库请求失败。分镜表本身还可以编辑。'); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setReady(true);
      setStatus('进入项目后才能把分镜保存到工程里。');
      return;
    }
    let cancelled = false;
    skipSave.current = true;
    fetch('/api/projects/' + projectId + '/storyboard')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload.storyboard) {
          setDoc(payload.storyboard);
          setSourceText(payload.storyboard.sourceText ?? '');
          setStatus('已读取保存的分镜');
        } else {
          setStatus(payload.message || '还没有分镜。贴上稿子，或从当前转写生成。');
        }
        setReady(true);
      })
      .catch(() => { if (!cancelled) { setError('分镜读取失败'); setReady(true); } });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!ready || !doc || !projectId) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const checked = validateScriptStoryboard(doc);
    if (!checked.ok) {
      setError(checked.issues[0] ?? '分镜还不能保存');
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus('保存中…');
      fetch('/api/projects/' + projectId + '/storyboard', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(doc)})
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) setError(payload.error || '保存失败');
          else { setError(''); setStatus('已保存'); }
        })
        .catch(() => setError('保存失败，请确认本地服务还在运行。'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [doc, projectId, ready]);

  const usable = assets.filter((asset) => !asset.deprecated);
  const known = new Map(assets.map((asset) => [asset.id, asset]));
  const apply = (result: EditResult) => {
    if (!result.ok) setError(result.error);
    else { setDoc(result.storyboard); setError(''); }
  };
  const generate = (from: 'script' | 'transcript') => {
    if (doc?.shots.length && !window.confirm('重新生成会替换当前分镜表，已保存的修改也会被覆盖。继续？')) return;
    const input = from === 'transcript' ? captionsToDraftInput(captions) : {sourceText, words: [], source: 'script' as const};
    if (!input.sourceText.trim()) {
      setError(from === 'transcript' ? '还没有转写。可以先把稿子贴在上面。' : '请先贴上稿子。');
      return;
    }
    const next = draftScriptStoryboard({...input, assets: usable, source: from});
    skipSave.current = false;
    setDoc(next);
    setSourceText(next.sourceText);
    setError('');
  };
  const reload = async () => {
    if (!projectId) return;
    const response = await fetch('/api/projects/' + projectId + '/storyboard');
    const payload = await response.json();
    if (!payload.storyboard) {
      setError(payload.message || '还没有已保存的分镜');
      return;
    }
    skipSave.current = true;
    setDoc(payload.storyboard);
    setSourceText(payload.storyboard.sourceText ?? '');
    setError('');
    setStatus('已重新读取');
  };
  const missing = doc ? missingAssetShots(doc).filter(({shot}) => !shot.assetId || (assets.length > 0 && !known.has(shot.assetId))) : [];
  const pickerShot = doc?.shots.find((shot) => shot.id === pickerId);
  const pickerAssets = usable.filter((asset) => {
    const needle = pickerQuery.trim().toLowerCase();
    if (!needle) return true;
    return [asset.title, asset.id, asset.category, asset.type, ...asset.keywords, ...asset.usages].join('\n').toLowerCase().includes(needle);
  });

  return (
    <div className="wb-overlay" onKeyDown={(event) => event.stopPropagation()}>
      <header className="wb-top">
        <button type="button" className="wb-back" onClick={onClose}>返回剪辑</button>
        <div>
          <p className="wb-kicker">转写之后</p>
          <h1>分镜表</h1>
        </div>
        <p className="wb-path">{doc ? `${doc.shots.length} 镜 · 缺素材 ${missing.length} 镜` : '尚未生成'}<br />{status}</p>
      </header>
      <div className="wb-body">
        <div className="wb-flow" aria-label="工作流">
          {['稿子', '分镜', '备素材', '精剪', '动效对齐', '预览', '导出'].map((step) => <span key={step} className={step === '分镜' ? 'is-on' : ''}>{step}</span>)}
        </div>
        <p className="wb-note">按句子拆开。配图留空就是缺素材。动效先记在镜头上，按字对齐放到下一期；字范围和词范围会先留下来。</p>
        {libraryNote && <p className="wb-missing" role="status">{libraryNote}</p>}
        <div className="wb-script">
          <label>稿子
            <textarea aria-label="口播稿" value={sourceText} placeholder={placeholder} onChange={(event) => setSourceText(event.target.value)} />
          </label>
          <div className="wb-actions">
            <button type="button" className="wb-primary" onClick={() => generate('script')} disabled={!libraryReady}>按稿子生成</button>
            <button type="button" onClick={() => generate('transcript')} disabled={!libraryReady || !captions.length}>从转写生成</button>
            <button type="button" disabled={!doc} onClick={() => doc && setDoc(rematchAssets(doc, usable, {onlyMissing: true}))}>只补缺素材</button>
            <button type="button" onClick={() => void reload()} disabled={!projectId}>重新读取</button>
            <span className="wb-status" role="status">{status}</span>
            {error && <span className="wb-error" role="alert">{error}</span>}
          </div>
        </div>
        {doc && (
          <div className="wb-missing" role="status" aria-label="缺素材汇总">
            {missing.length === 0
              ? '缺素材 0 镜。每镜都已指定配图。'
              : <>缺素材 {missing.length} 镜：{missing.map(({shot, index}) => <button type="button" key={shot.id} onClick={() => document.getElementById('shot-' + shot.id)?.scrollIntoView({block: 'center'})}>第 {index + 1} 镜 {shot.text.slice(0, 18) || '空镜头'}</button>)}</>}
          </div>
        )}
        {doc && (
          <div className="wb-scroll">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>#</th><th>原文</th><th>段落</th><th>重点词</th><th>配图</th><th>动效</th><th>备注</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {doc.shots.map((shot, index) => {
                  const asset = shot.assetId ? known.get(shot.assetId) : undefined;
                  const gap = !shot.assetId || (assets.length > 0 && !known.has(shot.assetId));
                  return (
                    <tr key={shot.id} id={'shot-' + shot.id} className={'wb-shot' + (gap ? ' missing' : '')}>
                      <td>{String(index + 1).padStart(2, '0')}{shot.charRange && <span className="wb-range">字 {shot.charRange.start}–{shot.charRange.end}</span>}{shot.wordRange && <span className="wb-range">词 {shot.wordRange.start}–{shot.wordRange.end}</span>}</td>
                      <td><textarea aria-label={'第' + (index + 1) + '镜原文'} ref={(node) => { if (node) textRefs.current.set(shot.id, node); else textRefs.current.delete(shot.id); }} value={shot.text} onChange={(event) => apply(updateShot(doc, shot.id, {text: event.target.value}))} /></td>
                      <td>
                        <select aria-label={'第' + (index + 1) + '镜段落'} value={shot.role} onChange={(event) => apply(updateShot(doc, shot.id, {role: event.target.value as ShotRole}))}>
                          {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="wb-emphasis">
                          {shot.emphasis.map((item, emphasisIndex) => (
                            <div key={emphasisIndex}>
                              <input aria-label={'第' + (index + 1) + '镜重点词' + (emphasisIndex + 1)} value={item.text} onChange={(event) => apply(updateShot(doc, shot.id, {emphasis: shot.emphasis.map((current, currentIndex) => currentIndex === emphasisIndex ? {...current, text: event.target.value} : current)}))} />
                              <select aria-label={'重点样式' + (emphasisIndex + 1)} value={item.style} onChange={(event) => apply(updateShot(doc, shot.id, {emphasis: shot.emphasis.map((current, currentIndex) => currentIndex === emphasisIndex ? {...current, style: event.target.value as '标红' | '荧光笔'} : current)}))}>
                                {EMPHASIS_STYLES.map((style) => <option key={style}>{style}</option>)}
                              </select>
                              <button type="button" className="wb-text-btn" onClick={() => apply(updateShot(doc, shot.id, {emphasis: shot.emphasis.filter((_, currentIndex) => currentIndex !== emphasisIndex)}))}>移除</button>
                            </div>
                          ))}
                          <button type="button" className="wb-text-btn" onClick={() => apply(updateShot(doc, shot.id, {emphasis: [...shot.emphasis, {text: '', style: '标红'}]}))}>添加重点词</button>
                        </div>
                      </td>
                      <td>
                        <div className="wb-asset">
                          {asset ? <img src={'/api/asset-library/media?id=' + encodeURIComponent(asset.id) + '&variant=thumb'} alt="" /> : <span className="wb-flag warn">{shot.assetId ? '素材不在当前库' : '缺素材'}</span>}
                          <strong>{asset?.title ?? (shot.assetId || '未选')}</strong>
                          {shot.match && <span className="wb-range">匹配 {shot.match.keywords.join('、')}</span>}
                          <button type="button" onClick={() => { setPickerId(shot.id); setPickerQuery(''); }}>换图</button>
                        </div>
                      </td>
                      <td>
                        <div className="wb-motions">
                          {MOTIONS.map((motion) => (
                            <label key={motion}><input type="checkbox" checked={shot.motions.includes(motion)} onChange={(event) => {
                              const motions = event.target.checked ? [...shot.motions, motion] : shot.motions.filter((item) => item !== motion);
                              apply(updateShot(doc, shot.id, {motions: motions as MotionKind[]}));
                            }} />{motion}</label>
                          ))}
                        </div>
                      </td>
                      <td><input aria-label={'第' + (index + 1) + '镜备注'} type="text" value={shot.note} onChange={(event) => apply(updateShot(doc, shot.id, {note: event.target.value}))} /></td>
                      <td>
                        <div className="wb-ops">
                          <button type="button" onClick={() => apply(splitShot(doc, shot.id, textRefs.current.get(shot.id)?.selectionStart ?? 0))}>拆分</button>
                          <button type="button" disabled={index === doc.shots.length - 1} onClick={() => apply(mergeShots(doc, shot.id))}>与下一镜合并</button>
                          <button type="button" onClick={() => apply(addShot(doc, shot.id))}>加一镜</button>
                          <button type="button" className="wb-danger" onClick={() => apply(removeShot(doc, shot.id))}>删除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pickerShot && doc && (
        <div className="wb-modal" onClick={() => setPickerId(null)}>
          <section role="dialog" aria-modal="true" aria-label="选择配图" onClick={(event) => event.stopPropagation()}>
            <h2>为这一镜换图</h2>
            <div className="wb-actions">
              <input aria-label="在素材库中搜索" value={pickerQuery} placeholder="搜索标题或关键词" onChange={(event) => setPickerQuery(event.target.value)} />
              <button type="button" onClick={() => { apply(updateShot(doc, pickerShot.id, {assetId: null})); setPickerId(null); }}>标为缺素材</button>
              <button type="button" className="wb-text-btn" onClick={() => setPickerId(null)}>关闭</button>
            </div>
            <div className="wb-grid" style={{marginTop: 14}}>
              {pickerAssets.map((asset) => (
                <button type="button" key={asset.id} className="wb-card" onClick={() => { apply(updateShot(doc, pickerShot.id, {assetId: asset.id})); setPickerId(null); }}>
                  <div className="wb-thumb">{asset.thumb || asset.path ? <img src={'/api/asset-library/media?id=' + encodeURIComponent(asset.id) + '&variant=thumb'} alt="" /> : <span>无预览</span>}</div>
                  <div className="wb-card-body"><h3>{asset.title}</h3><p>{asset.type} · {asset.keywords.slice(0, 4).join('、')}</p></div>
                </button>
              ))}
            </div>
            {pickerAssets.length === 0 && <p className="wb-note">没有可换的素材。停用项默认不在这里。</p>}
          </section>
        </div>
      )}
    </div>
  );
};
