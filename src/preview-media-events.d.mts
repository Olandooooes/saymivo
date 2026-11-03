/** Observe an actual forwarded media element, including asynchronous load/seek. */
export function observePreviewMedia(element:HTMLMediaElement|null,check:()=>void):()=>void;
