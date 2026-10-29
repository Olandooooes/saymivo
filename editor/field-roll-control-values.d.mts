import type {StoryScene} from '../src/storyboard.mjs';
import type {StageRect} from '../src/dynamic-mechanisms.mjs';
import type {FieldRollBoardConfig,FieldRollCard,FieldRollField,FieldRollProjectionProof} from '../src/field-roll-board.mjs';
export type FieldRollControlAction=
 |{type:'board';key:'copyWindow';value:FieldRollBoardConfig['copyWindow']}
 |{type:'board';key:'titleRect'|'speakerRect';value:StageRect}
 |{type:'card';cardId:string;key:'rect';value:StageRect}
 |{type:'card';cardId:string;key:'enterAtMs'|'enterMs'|'exitAtMs'|'exitMs';value:number}
 |{type:'field';cardId:string;fieldId:string;key:'label'|'to';value:string}
 |{type:'field';cardId:string;fieldId:string;key:'rect'|'labelRect';value:StageRect}
 |{type:'field';cardId:string;fieldId:string;key:'rollAtMs'|'cellRollMs'|'staggerMs';value:number}
 |{type:'field';cardId:string;fieldId:string;key:'direction';value:'up'|'down'}
 |{type:'field';cardId:string;fieldId:string;key:'provenance';value:FieldRollField['provenance']}
 |{type:'select-source';cardId:string;fieldId:string;sourceRef:string}
 |{type:'add-card';id:string}
 |{type:'remove-card';cardId:string}
 |{type:'move-card';cardId:string;delta:-1|1}
 |{type:'add-field';cardId:string;id:string}
 |{type:'remove-field';cardId:string;fieldId:string}
 |{type:'move-field';cardId:string;fieldId:string;delta:-1|1}
 |{type:'add-protection'}
 |{type:'remove-protection';index:number}
 |{type:'protection';index:number;key:'rect';value:StageRect}
 |{type:'protection';index:number;key:'label';value:string};
export function fieldRollControlSources(scene:StoryScene):{id:string;text:string;graphemeCount:number}[];
export function fieldRollControlMedia(scene:StoryScene):{id:string;src:string;kind:string;text?:string}[];
export function parseFieldRollControlNumber(value:string,options?:{seconds?:boolean}):{ok:boolean;value?:number;message?:string};
export function newFieldRollControlCard(id:string):FieldRollCard;
export function newFieldRollControlField(id:string):FieldRollField;
export function editFieldRollControl(config:FieldRollBoardConfig,action:FieldRollControlAction,scene:StoryScene):FieldRollBoardConfig;
export function fieldRollControlAssessment(scene:StoryScene,config:FieldRollBoardConfig,viewport?:{width:number;height:number},projectionProof?:FieldRollProjectionProof):{issues:string[];media:ReturnType<typeof fieldRollControlMedia>;canApply:false;rendererMeasured:false};
