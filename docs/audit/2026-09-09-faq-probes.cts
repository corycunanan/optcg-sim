/** Read-only audit probes. Run from repo root: node --import tsx docs/audit/2026-09-09-faq-probes.cts */
import { createBattleReadyState, createTestCardDb } from '../../workers/game/src/__tests__/helpers.ts';
import { executeSetBasePower } from '../../workers/game/src/engine/effect-resolver/actions/modifiers.ts';
import { getEffectivePower } from '../../workers/game/src/engine/modifiers.ts';
import { evaluateCondition, matchesFilter } from '../../workers/game/src/engine/conditions.ts';
import { computeAllValidTargets } from '../../workers/game/src/engine/effect-resolver/target-resolver.ts';
import { OP17_010_FOSSA } from '../../workers/game/src/engine/schemas/op17.ts';
import { OP16_048_BUGGY, OP16_058_THE_PRISONERS_ARE_RIOTING } from '../../workers/game/src/engine/schemas/op16.ts';
import { getEffectiveCounterValue } from '../../workers/game/src/engine/counter-value.ts';
import { OP17_118_ROCKS_D_XEBEC } from '../../workers/game/src/engine/schemas/op17.ts';
import { handleArrangeSearchDeck } from '../../workers/game/src/engine/effect-resolver/resume/deck.ts';
import { OP16_119_MARSHALL_D_TEACH } from '../../workers/game/src/engine/schemas/op16.ts';
import { resolveEffect, resumeFromStack } from '../../workers/game/src/engine/effect-resolver/index.ts';
import { OP17_050_STREUSEN, OP17_049_CHARLOTTE_LINLIN, OP17_075_X_DRAKE, OP17_099_CHARLOTTE_LINLIN } from '../../workers/game/src/engine/schemas/op17.ts';
import { validate } from '../../workers/game/src/engine/validation.ts';
const db = createTestCardDb();
let state = createBattleReadyState(db);
const leader = state.players[0].leader;
const ld = db.get(leader.cardId)!;
function setPower(value: number) {
 state = executeSetBasePower(state, {type:'SET_BASE_POWER',target:{type:'YOUR_LEADER'},params:{value},duration:{type:'THIS_TURN'}},leader.instanceId,0,db,new Map(),[leader.instanceId]).state;
}
setPower(8000); setPower(6000);
const results: {ruling:string; expected:unknown; actual:unknown}[] = [
 {ruling:'OP17-043 / ST34-004: highest simultaneous base setter applies',expected:8000,actual:getEffectivePower(leader,ld,state,db)},
 {ruling:'OP17-112: changed base power matches 8000',expected:true,actual:matchesFilter(leader,{base_power_exact:8000},db,state)},
];
// Isolate the base-filter bug from the competing-setter bug.
state=createBattleReadyState(db); setPower(8000);
results[1].actual=matchesFilter(leader,{base_power_exact:8000},db,state);
db.set(ld.id,{...ld,effectSchema:{effects:[],rule_modifications:[{rule_type:'TREATED_AS_ALL_IDENTITIES',names:true,types:true,attributes:true}]}});
const source=state.players[0].characters[0]!;
db.set(source.cardId,{...db.get(source.cardId)!,name:'Fossa'});
state.players[0].characters=[source,null,null,null,null];
const opponent=state.players[1].characters[0]!;
// Separate opponent data identity from the source fixture.
db.set('FAQ-OPPONENT',{...db.get(opponent.cardId)!,id:'FAQ-OPPONENT',name:'Opponent',power:10000});
state.players[1].characters[0]={...opponent,cardId:'FAQ-OPPONENT'};
results.push({ruling:'OP17-010: all-names Leader prevents Fossa activation',expected:false,actual:evaluateCondition(state,OP17_010_FOSSA.effects[0].conditions!,{sourceCardInstanceId:source.instanceId,controller:0,cardDb:db})});
for(const [schema,block] of [[OP16_048_BUGGY,1],[OP16_058_THE_PRISONERS_ARE_RIOTING,0]] as const){
 const target=schema.effects[block].actions![0].target;
 results.push({ruling:`${schema.card_id}: all-names Leader is an eligible target`,expected:true,actual:computeAllValidTargets(state,target,0,db,source.instanceId,new Map()).includes(leader.instanceId)});
}
state.turn.activePlayerIndex=1;state.turn.battleSubPhase='BLOCK_STEP';
state.turn.battle=null;
state.players[0].leader.state='ACTIVE';
db.set(ld.id,{...db.get(ld.id)!,keywords:{...ld.keywords,blocker:true}});
results.push({ruling:'Leader Blocker support (downstream of OP16-048 target fix)',expected:null,actual:validate(state,{type:'DECLARE_BLOCKER',blockerInstanceId:leader.instanceId},db,0)});

state=createBattleReadyState(db);
state.players[0].characters=[null,null,null,null,null];
const inHand={...state.players[0].hand[0],cardId:'FAQ-XEBEC',zone:'HAND' as const};
const xd={...db.get(source.cardId)!,id:'FAQ-XEBEC',counter:null,effectSchema:OP17_118_ROCKS_D_XEBEC};
db.set(xd.id,xd);state.players[0].hand=[inHand];
results.push({ruling:'OP17-118: no Counter on an empty Character field',expected:0,actual:getEffectiveCounterValue(inHand,xd,state,db)});
const picked=state.players[0].deck[0];const events:any[]=[];
handleArrangeSearchDeck(state,{type:'ARRANGE_TOP_CARDS',keptCardInstanceId:picked.instanceId,orderedInstanceIds:state.players[0].deck.slice(1,3).map(c=>c.instanceId),destination:'bottom'},OP16_119_MARSHALL_D_TEACH.effects[0].actions![0],0,[picked.instanceId],events);
results.push({ruling:'OP16-119: chosen Life card must not be publicly revealed',expected:false,actual:events.some(e=>e.type==='CARDS_REVEALED'&&e.payload.visibility==='BOTH')});

state=createBattleReadyState(db);
const before=state.players.map(p=>p.hand.length);
let choice=resolveEffect(state,OP17_049_CHARLOTTE_LINLIN.effects[0],state.players[0].characters[0]!.instanceId,0,db);
if(!choice.pendingPrompt) throw new Error('Expected OP17-049 choice');
choice=resumeFromStack(choice.state,{type:'PLAYER_CHOICE',choiceId:'0'},db);
results.push({ruling:'OP17-049: effect owner draws when opponent selects draw',expected:[2,0],actual:choice.state.players.map((p,i)=>p.hand.length-before[i])});
for(const [schema,action] of [[OP17_075_X_DRAKE,OP17_075_X_DRAKE.effects[0].actions![0]],[OP17_099_CHARLOTTE_LINLIN,(OP17_099_CHARLOTTE_LINLIN.effects[0].actions![0] as any).params.options[1][0]]] as const){
 const r=resolveEffect(state,{id:'audit-resolving-discard-branch',category:'auto',actions:[action]},state.players[0].characters[0]!.instanceId,0,db);
 results.push({ruling:`${schema.card_id}: effect owner chooses opponent facedown hand card`,expected:0,actual:r.pendingPrompt?.respondingPlayer});
}

state=createBattleReadyState(db);
const top=state.players[0].deck.slice(0,3);
let scry=resolveEffect(state,OP17_050_STREUSEN.effects[0],state.players[0].characters[0]!.instanceId,0,db);
if(!scry.pendingPrompt) throw new Error('Expected scry prompt');
scry=resumeFromStack(scry.state,{type:'ARRANGE_TOP_CARDS',orderedInstanceIds:top.slice(0,2).map(c=>c.instanceId),destination:'bottom'},db);
results.push({ruling:'OP17-050: bottom both looked-at cards, then draw original third card',expected:top[2].cardId,actual:scry.state.players[0].hand.at(-1)?.cardId});
console.log(JSON.stringify(results,null,2));
