import type {Clip} from './timeline';
import type {Caption} from './captions';
import type {StoryScene} from './storyboard.mjs';

export type PreExportAdvisory = {
  kind: 'caption-gap' | 'retake-candidate' | 'visual-rhythm';
  startSec: number;
  endSec: number;
  message: string;
  clipId?: string;
  captionIds?: string[];
  text?: string;
};
export type PreExportAuditOptions = {
  fps?: number;
  minCaptionGapSec?: number;
  minVisualGapSec?: number;
  duplicateWindowSec?: number;
};
/** Pure structural candidates only. Does not listen, analyze pixels, edit, or gate export. */
export function preExportAudit(project?: {clips?: Clip[]; captions?: Caption[]; presentation?: {scenes?: StoryScene[]}}, options?: PreExportAuditOptions): PreExportAdvisory[];
