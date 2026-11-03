import type {AudioClockConfig,AudioClockTake} from '../src/audio-clock.mjs';import type {AudioClockEvidence} from '../src/audio-clock-integration.mjs';
export function fetchVideoAudioEvidence(state:any,takeId:'A'|'B',src:string,startMs:number,endMs:number,options?:{fetcher?:typeof fetch;signal?:AbortSignal;bins?:number}):Promise<AudioClockEvidence>;
export function sourceWordTrackFromProject(state:any,take:AudioClockTake):NonNullable<AudioClockTake['wordTrack']>;
export function arrangeAudioClockTakes(config:AudioClockConfig):AudioClockConfig;
