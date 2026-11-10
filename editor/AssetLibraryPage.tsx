import React, {useEffect, useState} from 'react';
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
  note: string;
  path: string;
  thumb: string;
  width: number | null;
  height: number | null;
  color: string;
  deprecated: boolean;
};
type LibraryPayload = {
  ok: boolean;
  code?: string | null;
  message?: string;
  dir?: string;
  source?: string;
  categories?: string[];
  shown?: number;
  total?: number;
  hiddenDeprecated?: number;
  items?: Asset[];
};

const TYPES = ['插画', '贴纸印章', '章节卡', '界面'];
const USAGES = ['开场', '痛点', '方案', '结尾'];
const sourceLabel: Record<string, string> = {env: '环境变量 SAYMIVO_ASSETS_DIR', file: '服务配置', default: '默认 ~/saymivo-assets'};

export const AssetLibraryPage: React.FC<{onBack: () => void}> = ({onBack}) => {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [usage, setUsage] = useState('');
  const [type, setType] = useState('');
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [data, setData] = useState<LibraryPayload | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q), 180);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (category) params.set('category', category);
    if (usage) params.set('usage', usage);
    if (type) params.set('type', type);
    if (showDeprecated) params.set('deprecated', '1');
    const controller = new AbortController();
    fetch('/api/asset-library?' + params, {signal: controller.signal})
      .then((response) => response.json())
      .then((payload: LibraryPayload) => { setData(payload); setError(''); })
      .catch((reason) => { if (reason?.name !== 'AbortError') setError('素材库请求失败，请确认本地服务还在运行。'); });
    return () => controller.abort();
  }, [query, category, usage, type, showDeprecated]);

  const items = data?.items ?? [];
  return (
    <main className="wb-page">
      <header className="wb-top">
        <button type="button" className="wb-back" onClick={onBack}>返回</button>
        <div>
          <p className="wb-kicker">白板素材</p>
          <h1>素材库</h1>
        </div>
        <p className="wb-path">{data?.dir ? <>目录 {data.dir}<br />{sourceLabel[data.source ?? ''] ?? ''}</> : '正在读取本机素材目录'}</p>
      </header>
      <div className="wb-body">
        <div className="wb-flow" aria-label="工作流">
          {['稿子', '分镜', '备素材', '精剪', '动效对齐', '预览', '导出'].map((step) => <span key={step} className={step === '备素材' ? 'is-on' : ''}>{step}</span>)}
        </div>
        <div className="wb-filters">
          <input aria-label="搜索素材" type="search" placeholder="搜索标题、关键词、来源" value={q} onChange={(event) => setQ(event.target.value)} />
          <select aria-label="按分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">全部分类</option>
            {(data?.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" className="wb-chip" aria-pressed={usage === ''} onClick={() => setUsage('')}>全部用途</button>
          {USAGES.map((item) => <button type="button" key={item} className="wb-chip" aria-pressed={usage === item} onClick={() => setUsage(item)}>{item}</button>)}
          <button type="button" className="wb-chip" aria-pressed={type === ''} onClick={() => setType('')}>全部类型</button>
          {TYPES.map((item) => <button type="button" key={item} className="wb-chip" aria-pressed={type === item} onClick={() => setType(item)}>{item}</button>)}
          <label className="wb-check"><input type="checkbox" checked={showDeprecated} onChange={(event) => setShowDeprecated(event.target.checked)} />显示已停用</label>
        </div>
        <p className="wb-note">显示 {data?.shown ?? 0} 条{!showDeprecated && (data?.hiddenDeprecated ?? 0) > 0 ? `，已隐藏 ${data?.hiddenDeprecated} 条停用素材` : ''}。图片留在本机，不会写入仓库。这一期只浏览已有素材。</p>
        {error && <p className="wb-error" role="alert">{error}</p>}
        {data && !data.ok && (
          <section className="wb-empty" role="status">
            <h2>还没接到素材目录</h2>
            <p>{data.message}</p>
            <p>在 Mac 上可以把现有插画库的路径填进「服务配置」的白板素材目录，或在启动前设置 <code>SAYMIVO_ASSETS_DIR</code>。目录里需要有 <code>library.json</code>，字段沿用现在的索引（id、文件路径、类别、中文标题、关键词、适合用法、来源、生成提示词、deprecated）。默认路径是 <code>~/saymivo-assets</code>。</p>
          </section>
        )}
        {data?.ok && items.length === 0 && <p className="wb-empty" role="status">没有符合当前搜索或筛选的素材。</p>}
        <div className="wb-grid">
          {items.map((item) => {
            const open = openId === item.id;
            return (
                <button type="button" key={item.id} className={'wb-card' + (open ? ' is-open' : '')} onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}>
                  <div className="wb-thumb">
                    {item.thumb || item.path ? (
                      broken[item.id]
                        ? <span>无预览</span>
                        : <img src={'/api/asset-library/media?id=' + encodeURIComponent(item.id) + '&variant=thumb'} alt="" onError={() => setBroken((prev) => ({...prev, [item.id]: true}))} />
                    ) : <span>无预览</span>}
                  </div>
                  <div className="wb-card-body">
                    <h3>{item.title}</h3>
                    <div className="wb-meta">
                      <i>{item.type}</i>
                      {item.category && <i>{item.category}</i>}
                      {item.usages.map((use) => <i key={use}>{use}</i>)}
                      {item.deprecated && <i className="wb-flag warn">已停用</i>}
                    </div>
                    <p>{item.keywords.join('、') || '无关键词'} · {item.source || '未标来源'}</p>
                    {open && (
                      <div className="wb-detail">
                        <p>id {item.id}</p>
                        <p>{item.path || '未记录文件路径'}{item.width && item.height ? ` · ${item.width}×${item.height}` : ''}</p>
                        {item.color && <p>主色 {item.color}</p>}
                        {item.note && <p>{item.note}</p>}
                        {item.prompt && <p>{item.prompt}</p>}
                      </div>
                    )}
                  </div>
                </button>
            );
          })}
        </div>
      </div>
    </main>
  );
};
