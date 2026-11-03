import {draftWithLlm, llmSettings} from '../src/plan-llm.mjs';

export async function planDraftRoute({req, res, url, json, body}) {
  if (url.pathname === '/api/plan/llm' && req.method === 'GET') {
    json(res, 200, {enabled: Boolean(llmSettings())});
    return true;
  }
  if (url.pathname !== '/api/plan/draft') return false;
  if (req.method !== 'POST') { json(res, 405, {error: '请使用 POST'}); return true; }
  if (!llmSettings()) { json(res, 200, {source: 'rules', error: '未配置 OPENAI_API_KEY'}); return true; }
  const data = await body(req);
  const result = await draftWithLlm({words: data.words ?? [], removes: data.removes ?? [], corrections: data.corrections ?? [], faceBox: data.faceBox ?? null, style: data.style});
  json(res, 200, {source: result.source, plan: result.plan, warnings: result.warnings});
  return true;
}
