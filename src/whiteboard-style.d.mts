export function validateWhiteboardStyle(style: unknown): string[];
export function readWhiteboardStyle(text?: string): {ok: boolean; issues: string[]; style: Record<string, any> | null};
