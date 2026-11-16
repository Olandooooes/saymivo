import type {ScriptStoryboard} from './script-storyboard.mjs';

export function projectKeepMs(ms: number, keeps: Array<[number, number]> | null): number | null;
export function keepsKey(keeps: Array<[number, number]> | null): string;
export function clampLead(style: {align: {leadMs: number; leadMinMs: number; leadMaxMs: number}}, leadMs?: number): number;
export function typedTextAt(steps: Array<{text: string; atMs: number}> | null | undefined, timeMs: number): string;
export function alignmentStale(doc: {align?: {keepsKey?: string} | null}, keeps: Array<[number, number]> | null): boolean;
export function captionsDrifted(doc: ScriptStoryboard, captions: Array<{startMs?: number; words?: Array<{text?: string; startMs?: number; endMs?: number}>}> | undefined): boolean;
export function alignStoryboard(doc: ScriptStoryboard, options: {keeps?: Array<[number, number]> | null; style: any; leadMs?: number}): {storyboard: ScriptStoryboard; issues: Array<{shotId: string | null; message: string}>};
