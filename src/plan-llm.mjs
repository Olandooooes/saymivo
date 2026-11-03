// Optional storyboard draft. The model may only fill the schema; times stay on the rule draft.
import fs from 'node:fs';
import {draftPlan, prepareWords, validatePlan, SHOTS, SLIDE_KINDS} from './plan.mjs';

const promptTemplate = fs.readFileSync(new URL('../prompts/plan-draft.txt', import.meta.url), 'utf8');

export const OLLAMA_BASE = 'http://127.0.0.1:11434/v1';
export const DEFAULT_LOCAL_MODEL = 'qwen2.5:7b';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const LLM_TEMPERATURE = 0.2;
export const DEFAULT_BATCH_TIMEOUT_MS = 120_000;
export const DEFAULT_BATCH = {maxSentences: 8, maxChars: 1200};

export function installHint(model = DEFAULT_LOCAL_MODEL) {
  return `请运行 bash scripts/setup-local-llm.sh 安装本机模型 ${model}`;
}

function apiBase(value, fallback) {
  const raw = String(value || fallback).replace(/\/$/, '');
  return raw.endsWith('/v1') ? raw : `${raw}/v1`;
}

function preference(env) {
  const value = String(env.PLAN_LLM_PROVIDER || 'auto').toLowerCase();
  return value === 'openai' || value === 'ollama' ? value : 'auto';
}

export function llmSettings(env = process.env) {
  const chosen = preference(env);
  if (chosen === 'ollama') {
    return {
      provider: 'ollama',
      key: '',
      base: apiBase(env.OLLAMA_BASE_URL, OLLAMA_BASE),
      model: env.PLAN_LLM_MODEL || DEFAULT_LOCAL_MODEL,
    };
  }
  if (!env.OPENAI_API_KEY) return null;
  return {
    provider: 'openai',
    key: env.OPENAI_API_KEY,
    base: apiBase(env.OPENAI_BASE_URL, 'https://api.openai.com/v1'),
    model: env.PLAN_LLM_MODEL || DEFAULT_OPENAI_MODEL,
  };
}

export async function probeOllama({base = OLLAMA_BASE, model = DEFAULT_LOCAL_MODEL, fetchImpl = fetch, timeoutMs = 1500} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBase(base, OLLAMA_BASE)}/models`, {signal: controller.signal});
    if (!response?.ok) return {ok: false, reason: `Ollama 返回 ${response?.status ?? '异常'}`};
    const payload = await response.json();
    const names = [...(payload?.data ?? []), ...(payload?.models ?? [])].map(item => item?.id || item?.name).filter(Boolean);
    if (!names.includes(model)) return {ok: false, reason: `本机 Ollama 还没有模型 ${model}`, missingModel: true, models: names};
    return {ok: true, models: names};
  } catch (error) {
    return {ok: false, reason: error?.name === 'AbortError' ? '连接 Ollama 超时' : '没有探测到本机 Ollama'};
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveLlm({env = process.env, fetchImpl = fetch, probeImpl, timeoutMs = 1500} = {}) {
  const chosen = preference(env);
  if (chosen === 'openai' || (chosen === 'auto' && env.OPENAI_API_KEY)) {
    if (!env.OPENAI_API_KEY) return {available: false, provider: null, model: null, message: '已指定 openai，但未配置 OPENAI_API_KEY'};
    const settings = llmSettings({...env, PLAN_LLM_PROVIDER: 'openai'});
    return {available: true, ...settings};
  }
  const model = env.PLAN_LLM_MODEL || DEFAULT_LOCAL_MODEL;
  const base = apiBase(env.OLLAMA_BASE_URL, OLLAMA_BASE);
  const probed = probeImpl ? await probeImpl({base, model}) : await probeOllama({base, model, fetchImpl, timeoutMs});
  if (!probed?.ok) {
    const why = chosen === 'ollama' ? `已指定本机模型，但${probed?.reason || '没有探测到 Ollama'}` : `未配置 OPENAI_API_KEY，且${probed?.reason || '没有探测到本机 Ollama'}`;
    return {available: false, provider: null, model, message: `${why}。${installHint(model)}`};
  }
  return {available: true, provider: 'ollama', model, base, key: ''};
}

export function batchSentences(sentences = [], {maxSentences = DEFAULT_BATCH.maxSentences, maxChars = DEFAULT_BATCH.maxChars} = {}) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const sentence of sentences) {
    const length = Math.max(1, [...String(sentence?.text ?? '')].length);
    if (current.length && (current.length >= maxSentences || chars + length > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(sentence);
    chars += length;
  }
  if (current.length) batches.push(current);
  return batches;
}

const fold = text => String(text ?? '').replace(/[，,。！？!?、；;：:\s]/g, '');

function wordsInSentence(sentence, words) {
  return words.filter(word => word.endMs > sentence.startMs && word.startMs < sentence.endMs).sort((a, b) => a.startMs - b.startMs);
}

function locateSpan(text, sentenceWords, {maxChars = 80} = {}) {
  const needle = fold(text);
  if (!needle || [...needle].length > maxChars) return null;
  for (let start = 0; start < sentenceWords.length; start++) {
    let joined = '';
    for (let end = start; end < sentenceWords.length; end++) {
      joined += fold(sentenceWords[end].text);
      if (joined.length > maxChars && !joined.includes(needle)) break;
      if (joined.includes(needle)) return {text: needle, atWordId: sentenceWords[start].id, atMs: sentenceWords[start].startMs};
    }
  }
  return null;
}

function contentOf(payload) {
  if (typeof payload === 'string') return payload;
  return payload?.choices?.[0]?.message?.content ?? payload?.content ?? payload?.text ?? '';
}

export function adoptLlmDraft(payload, base, words, removes = []) {
  const warnings = [];
  let parsed;
  try {
    parsed = JSON.parse(contentOf(payload));
  } catch {
    return {ok: false, plan: base, warnings: [{code: 'llm-fallback', message: '模型没有返回 JSON，已用规则底稿'}]};
  }
  if (!parsed || !Array.isArray(parsed.sentences)) {
    return {ok: false, plan: base, warnings: [{code: 'llm-fallback', message: '模型结果缺少句子，已用规则底稿'}]};
  }
  const kept = prepareWords(words, {removes});
  const transcript = kept.map(word => word.text).join('');
  const sentences = base.sentences.map(sentence => {
    const proposed = parsed.sentences.find(row => row?.id === sentence.id) ?? {};
    if (Number.isFinite(proposed.startMs) && proposed.startMs !== sentence.startMs) warnings.push({sentenceId: sentence.id, code: 'time-locked', message: '已忽略模型改过的时间'});
    const next = {...sentence, labels: [], slide: null, cta: false};
    if (SHOTS.includes(proposed.shot)) next.shot = proposed.shot;
    else if (proposed.shot) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '景别不在允许的三种里，已保留原来的景别'});
    const local = wordsInSentence(sentence, kept);
    if (proposed.punch?.text) {
      const hit = locateSpan(proposed.punch.text, local, {maxChars: 12});
      if (!hit) {
        next.punch = null;
        warnings.push({sentenceId: sentence.id, code: 'dropped', message: '大字不是保留词里的连续文字，已丢掉'});
      } else next.punch = hit;
    }
    for (const label of proposed.labels ?? []) {
      const hit = locateSpan(label?.text, local, {maxChars: 12});
      if (!hit) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '标签不在原话里，已丢掉'});
      else next.labels.push({text: hit.text, atMs: hit.atMs, atWordId: hit.atWordId});
    }
    if (proposed.slide && SLIDE_KINDS.includes(proposed.slide.kind)) {
      const items = [];
      for (const item of proposed.slide.items ?? []) {
        const hit = locateSpan(item?.title, local);
        if (!hit) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '全屏页条目不在原话里，已丢掉'});
        else items.push({id: item.id || `item-${items.length + 1}`, title: hit.text, atWordId: hit.atWordId, atMs: hit.atMs, status: 'aligned'});
      }
      let title = String(proposed.slide.title ?? '');
      if (title && (invented(title, transcript) || [...title].length > 16)) {
        warnings.push({sentenceId: sentence.id, code: 'dropped', message: '全屏页标题不能概括，已去掉标题'});
        title = '';
      }
      if (items.length) next.slide = {kind: proposed.slide.kind, title, items};
      else if (proposed.slide.items?.length) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '这页没有可用条目，已去掉'});
    } else if (proposed.slide) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '全屏页种类不受支持，已去掉'});
    if (proposed.cta === true) next.cta = true;
    return next;
  });
  const chapters = (base.chapters ?? []).map((chapter, index) => {
    const proposed = (parsed.chapters ?? [])[index];
    if (!proposed?.title) return {...chapter, title: ''};
    const title = String(proposed.title);
    if (invented(title, transcript) || [...title].length > 10) {
      warnings.push({sentenceId: chapter.id, code: 'dropped', message: '章节标题不合法，已留空'});
      return {...chapter, title: ''};
    }
    return {...chapter, title};
  });
  if ((parsed.chapters ?? []).length > 6) warnings.push({code: 'dropped', message: '章节超过 6 个，多出的已丢掉'});
  const checked = validatePlan({...base, chapters, sentences, warnings}, {words, removes});
  return {ok: true, plan: {...checked.plan, warnings: [...warnings, ...checked.issues.map(issue => ({...issue, code: issue.code === 'rejected-hallucination' ? 'dropped' : issue.code}))]}, warnings};
}

function invented(text, source) {
  const digits = String(text).match(/\d+(?:\.\d+)?/g) ?? [];
  if (digits.some(digit => !source.includes(digit))) return true;
  return [...String(text)].some(char => '不没非别莫勿'.includes(char) && !source.includes(char));
}

function messages(base, kept, faceBox, style) {
  const input = {
    words: kept.map(word => ({id: word.id, text: word.text, startMs: word.startMs, endMs: word.endMs})),
    chapters: (base.chapters ?? []).map(chapter => ({id: chapter.id, startMs: chapter.startMs})),
    sentences: base.sentences.map(sentence => ({id: sentence.id, text: sentence.text, startMs: sentence.startMs, endMs: sentence.endMs, chapterId: sentence.chapterId})),
    face: Boolean(faceBox),
    style: style ?? base.style,
  };
  return [
    {role: 'system', content: promptTemplate},
    {role: 'user', content: JSON.stringify(input)},
  ];
}

function slicePlan(base, sentences) {
  const ids = new Set(sentences.map(sentence => sentence.id));
  const chapterIds = new Set(sentences.map(sentence => sentence.chapterId).filter(Boolean));
  return {
    ...base,
    sentences: base.sentences.filter(sentence => ids.has(sentence.id)),
    chapters: (base.chapters ?? []).filter(chapter => chapterIds.has(chapter.id)),
  };
}

function wordsCovering(sentences, kept) {
  if (!sentences.length) return [];
  const start = Math.min(...sentences.map(sentence => sentence.startMs));
  const end = Math.max(...sentences.map(sentence => sentence.endMs));
  return kept.filter(word => word.endMs > start && word.startMs < end);
}

async function defaultFetch({url, body, signal, key}) {
  const headers = {'Content-Type': 'application/json'};
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(url, {method: 'POST', headers, body: JSON.stringify(body), signal});
  if (!response.ok) throw Error(`模型接口 ${response.status}`);
  return response.json();
}

function fallbackWarning(failure, batch, total) {
  const timedOut = failure?.name === 'AbortError' || failure?.timedOut;
  const missingJson = String(failure?.message ?? '').includes('JSON');
  if (total === 1) {
    if (timedOut) return {code: 'llm-fallback', message: '模型超时，已用规则底稿'};
    if (missingJson) return {code: 'llm-fallback', message: '模型没有返回 JSON，已用规则底稿'};
    if (failure?.message) return {code: 'llm-fallback', message: failure.message};
    return {code: 'llm-fallback', message: '模型请求失败，已用规则底稿'};
  }
  const reason = timedOut ? '超时' : missingJson ? '没有返回 JSON' : '失败';
  return {code: 'llm-fallback', message: `第 ${batch} 批${reason}，这一批已用规则底稿`};
}

async function requestBatch({settings, slice, words, removes, kept, faceBox, style, fetchImpl, timeoutMs}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await fetchImpl({
      url: `${settings.base}/chat/completions`,
      key: settings.key,
      signal: controller.signal,
      body: {
        model: settings.model,
        temperature: LLM_TEMPERATURE,
        response_format: {type: 'json_object'},
        messages: messages(slice, wordsCovering(slice.sentences, kept), faceBox, style),
      },
    });
    return adoptLlmDraft(payload, slice, words, removes);
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return {ok: false, plan: slice, warnings: [{code: 'llm-fallback', message: timedOut ? '模型超时，已用规则底稿' : '模型请求失败，已用规则底稿'}], timedOut};
  } finally {
    clearTimeout(timer);
  }
}

function mergeBatches(base, outcomes) {
  const sentences = new Map();
  const titles = new Map();
  const warnings = [];
  for (const outcome of outcomes) {
    warnings.push(...(outcome.ok ? outcome.plan.warnings ?? outcome.warnings ?? [] : outcome.warnings ?? []));
    if (!outcome.ok) continue;
    for (const sentence of outcome.plan.sentences) sentences.set(sentence.id, sentence);
    for (const chapter of outcome.plan.chapters ?? []) {
      if (chapter.title && !titles.has(chapter.id)) titles.set(chapter.id, chapter.title);
    }
  }
  return {
    plan: {
      ...base,
      sentences: base.sentences.map(sentence => sentences.get(sentence.id) ?? sentence),
      chapters: (base.chapters ?? []).map(chapter => titles.has(chapter.id) ? {...chapter, title: titles.get(chapter.id)} : chapter),
      warnings,
    },
    warnings,
  };
}

export async function draftWithLlm({words = [], removes = [], corrections = [], faceBox = null, style, env = process.env, fetchImpl = defaultFetch, probeImpl, probeFetch = fetch, timeoutMs = DEFAULT_BATCH_TIMEOUT_MS, batch = DEFAULT_BATCH, onProgress} = {}) {
  const base = draftPlan({words, removes, corrections, style});
  const settings = await resolveLlm({env, fetchImpl: probeFetch, probeImpl});
  if (!settings.available) return {plan: base, warnings: [{code: 'llm-unconfigured', message: settings.message}], source: 'rules', provider: null, model: settings.model ?? null};
  const batches = batchSentences(base.sentences, batch);
  if (!batches.length) return {plan: base, warnings: [], source: 'rules', provider: settings.provider, model: settings.model};
  const kept = prepareWords(words, {removes, corrections});
  const outcomes = [];
  let adopted = 0;
  for (let index = 0; index < batches.length; index++) {
    const slice = slicePlan(base, batches[index]);
    const progress = {provider: settings.provider, model: settings.model, batch: index + 1, total: batches.length};
    onProgress?.({...progress, status: 'start'});
    let outcome = await requestBatch({settings, slice, words, removes, kept, faceBox, style, fetchImpl, timeoutMs});
    if (!outcome.ok) {
      onProgress?.({...progress, status: 'retry'});
      outcome = await requestBatch({settings, slice, words, removes, kept, faceBox, style, fetchImpl, timeoutMs});
    }
    if (!outcome.ok) {
      const warning = fallbackWarning({name: outcome.timedOut ? 'AbortError' : '', message: outcome.warnings?.[0]?.message}, index + 1, batches.length);
      outcome = {ok: false, plan: slice, warnings: [warning]};
      onProgress?.({...progress, status: 'fallback'});
    } else adopted += 1;
    outcomes.push(outcome);
  }
  if (!adopted) return {plan: base, warnings: outcomes.flatMap(outcome => outcome.warnings ?? []), source: 'rules', provider: settings.provider, model: settings.model};
  const merged = mergeBatches(base, outcomes);
  return {plan: merged.plan, warnings: merged.warnings, source: 'llm', provider: settings.provider, model: settings.model};
}
