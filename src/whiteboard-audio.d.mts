export function voiceLoudnormFilter(style: any, measured?: {input_i: number; input_tp: number; input_lra: number; input_thresh: number; target_offset: number} | null): string;
export function sfxAmplitude(style: any): number;
export function musicGainDb(style: any, timeMs: number, voiceSpans?: Array<{startMs: number; endMs: number}>): number | null;
export function sfxEvents(doc: {shots?: Array<{id: string; cues?: Array<{motion: string; atMs: number}>}>}, style: any): Array<{motion: string; atMs: number; file: string; gainDb: number; shotId: string}>;
export function voiceSpans(doc: {shots?: Array<{id: string; timeRange: {startMs: number; endMs: number} | null}>}): Array<{startMs: number; endMs: number; shotId: string}>;
