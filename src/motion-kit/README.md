# Independent motion components

Eight scene components share a deterministic Remotion frame clock, explicit configuration and existing loaded-font measurement helpers. They do not read the project store or require a speaker video, original scene, audio, captions, transcript, private source identity, cloud service or apply/export receipt. Existing production scene renderers are unchanged.

```tsx
import {Sequence, useVideoConfig} from 'remotion';
import {MotionKitScene} from './motion-kit/Components';
import {defaultKitConfig, kitTimeline} from './motion-kit/model.mjs';

export function Example() {
  const {fps} = useVideoConfig();
  const config = defaultKitConfig('source-token-transfer');
  config.source = '保留来源，再核对条件。';
  config.tokens = ['来源', '条件'];
  return <Sequence from={0} durationInFrames={Math.ceil(kitTimeline(config).duration * fps)} premountFor={fps}>
    <MotionKitScene config={config} transparent />
  </Sequence>;
}
```

`MotionKitScene` accepts `config`, optional `transparent` and an optional `onReadiness` callback. It uses `useCurrentFrame()/fps`; seeking backwards or changing fps does not create independent wall-clock timers. The named components are also exported for advanced composition; they receive `{config, t}` with `t` in seconds relative to their own scene. Configuration checks and media/font readiness remain the caller's responsibility when mounting a raw named component.

## Components and data

| ID | Named component | Required authored content |
|---|---|---|
| emphasis-phrase | EmphasisPhrase | Complete phrase list; stacked or sequential organization; primary/secondary colors, scale, tracking, shadow depth |
| flip-board | RollingOverview | Complete lines, rows, columns, stagger; overflow is paginated without cutting graphemes |
| source-token-transfer | SourceTokenTransfer | Complete source and 1–8 exact nonoverlapping source tokens, configurable target columns; actual loaded-font DOM anchors |
| screenshot-region-focus | ScreenshotRegionFocus | Local image dimensions, percentage ROI, spotlight or lifted zoom; only the image is dimmed |
| evidence-handoff | EvidenceHandoff | Captions and per-card images; each card/title shares a stable object and local coordinate space |
| orbit-flow-variant | OrbitTransfer | Illustrative point count, opening, target direction; each particle passes the opening and accumulates at the target |
| field-roll-board | FieldRollBoard | Stable card IDs, label and explicit from/to text; card rectangles never rotate |
| persistent-entities | PersistentChecklist | Complete checklist, summary and next-stage label; timeline and archive are distinct modes |

Common style settings include title, font ID, font-size ceiling, colors, entry/change/hold/gap/exit durations. `kitTimeline` derives the total duration; it does not silently compress the motion into an unrelated clip length. Fields irrelevant to the selected mode are hidden by the laboratory parameter panel.

`kitIssues` validates authored input. Missing source words, overlap, invalid image paths, ROI outside the image, unknown modes, unsupported fonts, non-finite values and duplicate stable card IDs are rejected. Loaded-font text that cannot fit as complete text produces a visible blocked status rather than cutting the end off. The layout permits a smaller font down to its declared minimum; this is not a proof of reading time or aesthetic quality.

`exportKitConfig` and `importKitConfig` serialize plain versioned configuration. The laboratory persists only valid drafts in its own origin's localStorage; its sandbox query disables draft reads/writes during validation. It does not use the workbench's project persistence APIs.

## Assets and compatibility

The defaults for image-based scenes use the three original files in `public/motion-kit-demo/`. A host can instead pass local image paths with actual width/height. The evidence scene accepts a fallback `image` and optional per-card `images`; fewer per-card entries fall back to `image`. Image sources and captions remain independent authored inputs, not fabricated factual evidence.

Typography uses the host's existing display-font infrastructure and files in `public/fonts/`. Supported font IDs are source-han, douyin and smiley; keep their existing licenses. Default gallery canvases are 1920×1080 and 1080×1920. Other sizes inherit normalized layout, but arbitrary aspect ratios still need visual review.

The existing renderer/API/preview/readiness architecture remains available. This independent kit is not silently registered as a production preset and does not modify any existing project's motion configuration, person window, cut points or audio.

## Reference interpretation

The original implementation catalog confused some related mechanisms. The reference defaults now distinguish layered simultaneous emphasis from sequential replacement, in-place spotlight from lifted ROI zoom, and a checklist connecting to a timeline from moving into an archive. Alternate actions are separately selected modes, not claims about unseen source animation.

Timing/geometry are independent reconstructions, not recovered author project files or measured source easing curves. Browser readiness, unit tests and successful builds do not establish reference equivalence or human visual acceptance. Creator footage stays in the separate local laboratory and is not included with this source package.

## Validation

Run `node --test tests/motion-kit.test.mjs` and the repository's `npm run check`. The laboratory has a separate TypeScript check/build. Actual browser checks cover standard/long/many-object samples, landscape/portrait, font remeasurement, invalid tokens/ROI, replay and configuration import/export. Visual difference notes remain per entry; no user-acceptance flag is generated by the component.
