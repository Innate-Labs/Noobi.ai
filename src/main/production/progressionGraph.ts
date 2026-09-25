import type { ProgressionAction, ProgressionDefinition, ProgressionRequirements, ProgressionState } from '../../shared/progression.js';
export const PROGRESSION_VALIDATOR_VERSION = 'progression-v1';
const object = (v: unknown): v is Record<string, any> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(v);
const integer = (v: unknown, max = 99) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;
function requireThat(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`PROGRESSION: ${reason}`); }
function ids(v: unknown, allowed?: string[]): v is string[] {
  return Array.isArray(v) && v.length <= 64 && v.every(x => id(x) && (!allowed || allowed.includes(x))) && new Set(v).size === v.length;
}
export function parseProgression(value: unknown): ProgressionDefinition {
  requireThat(object(value) && value.version === 1, 'requires version 1');
  const d = value;
  requireThat(object(d.items) && Object.keys(d.items).length <= 32 && Object.entries(d.items).every(([key,v]) => id(key) && object(v) && integer(v.max)), 'invalid item limits');
  requireThat(ids(d.abilities) && d.abilities.length <= 32 && ids(d.regions) && d.regions.length > 0 && d.regions.length <= 32
    && d.regions.includes(d.start) && ids(d.goals,d.regions) && d.goals.length > 0, 'invalid regions, start or goals');
  requireThat(Array.isArray(d.quests) && d.quests.length <= 32 && d.quests.every(q=>object(q) && id(q.id)) && new Set(d.quests.map(q=>q.id)).size === d.quests.length, 'invalid quests');
  const questIds = d.quests.map(q=>q.id);
  const itemCounts = (v: unknown) => object(v) && Object.entries(v).every(([key,count]) => Object.hasOwn(d.items,key) && integer(count,d.items[key].max));
  const needs = (v: unknown) => object(v) && ids(v.quests,questIds) && ids(v.abilities,d.abilities) && itemCounts(v.items);
  requireThat(ids(d.goalQuests,questIds) && object(d.initial) && itemCounts(d.initial.items) && ids(d.initial.abilities,d.abilities), 'invalid initial state or goal quests');
  requireThat(d.quests.every(q=>d.regions.includes(q.region) && needs(q.requires) && object(q.reward) && itemCounts(q.reward.items) && ids(q.reward.abilities,d.abilities)), 'invalid quest conditions/rewards');
  requireThat(Array.isArray(d.links) && d.links.length <= 64 && d.links.every(e=>object(e) && id(e.id) && d.regions.includes(e.from) && d.regions.includes(e.to)
    && e.from !== e.to && typeof e.bidirectional === 'boolean' && needs(e.requires) && itemCounts(e.consume)
    && Object.entries(e.consume).every(([key,count])=>Number(e.requires.items[key] ?? 0) >= Number(count)))
    && new Set(d.links.map(e=>e.id)).size === d.links.length, 'invalid links or key consumption exceeds requirement');
  const done = new Set<string>(), visiting = new Set<string>();
  const visit = (key: string) => { requireThat(!visiting.has(key), `cyclic quest prerequisite at ${key}`); if(done.has(key))return;
    visiting.add(key); for(const prior of d.quests.find((q: { id: string })=>q.id===key)!.requires.quests) visit(prior); visiting.delete(key); done.add(key); };
  questIds.forEach(visit);
  return structuredClone(d) as unknown as ProgressionDefinition;
}
export function initialProgression(d: ProgressionDefinition): ProgressionState {
  return { region:d.start, inventory:Object.fromEntries(Object.keys(d.items).sort().map(key=>[key,d.initial.items[key] ?? 0])),
    abilities:[...d.initial.abilities].sort(), completed:[], opened:[] };
}
const satisfies = (s: ProgressionState, r: ProgressionRequirements) => r.quests.every(x=>s.completed.includes(x)) && r.abilities.every(x=>s.abilities.includes(x))
  && Object.entries(r.items).every(([key,count])=>s.inventory[key]! >= count);
export function applyProgression(d: ProgressionDefinition, s: ProgressionState, action: ProgressionAction): ProgressionState | null {
  const next = structuredClone(s);
  if (action.kind === 'quest') {
    const q = d.quests.find(q=>q.id===action.id);
    if(!q || s.completed.includes(q.id) || q.region!==s.region || !satisfies(s,q.requires)) return null;
    if(Object.entries(q.reward.items).some(([key,count])=>s.inventory[key]! + count > d.items[key]!.max)) return null;
    for(const [key,count] of Object.entries(q.reward.items)) next.inventory[key]! += count;
    next.abilities=[...new Set([...s.abilities,...q.reward.abilities])].sort();next.completed.push(q.id);next.completed.sort();
  } else {
    const e = d.links.find(e=>e.id===action.id);
    if(!e || (e.from!==s.region && !(e.bidirectional && e.to===s.region)))return null;
    if(!s.opened.includes(e.id)) {
      if(!satisfies(s,e.requires))return null;
      for(const [key,count] of Object.entries(e.consume))next.inventory[key]! -= count;
      next.opened.push(e.id);next.opened.sort();
    }
    next.region=e.from===s.region?e.to:e.from;
  }
  return next;
}
export function analyzeProgression(d: ProgressionDefinition, maxStates = 10000): { ok: boolean; complete: boolean; states: number; findings: string[]; route: ProgressionAction[] } {
  const actions: ProgressionAction[]=[...d.quests.map(q=>({kind:'quest' as const,id:q.id})),...d.links.map(e=>({kind:'travel' as const,id:e.id}))];
  const states=[initialProgression(d)], known=new Map([[JSON.stringify(states[0]),0]]), parents:Array<{index:number;action:ProgressionAction}|null>=[null], reverse:number[][]=[[]], winners:number[]=[];
  const started=Date.now();let transitions=0;
  for(let i=0;i<states.length;i++) {
    if(Date.now()-started>2000 || transitions>300000)return {ok:false,complete:false,states:states.length,findings:['Logical state exploration budget exceeded; no reachability guarantee'],route:[]};
    const state=states[i]!;
    if(d.goals.includes(state.region) && d.goalQuests.every(q=>state.completed.includes(q))) { winners.push(i); continue; }
    for(const action of actions){transitions++;const next=applyProgression(d,state,action);if(!next)continue;
      const key=JSON.stringify(next);let index=known.get(key);
      if(index===undefined){if(states.length>=maxStates)return {ok:false,complete:false,states:states.length,findings:['Logical state exploration budget exceeded; no reachability guarantee'],route:[]};
        index=states.length;known.set(key,index);states.push(next);parents.push({index:i,action});reverse.push([]);}
      reverse[index]!.push(i);
    }
  }
  const findings:string[]=[];
  if(!winners.length)findings.push('No reachable ending; check keys, abilities and quest prerequisites');
  const canFinish=new Set(winners),queue=[...winners];
  for(let i=0;i<queue.length;i++)for(const prior of reverse[queue[i]!]!)if(!canFinish.has(prior)){canFinish.add(prior);queue.push(prior);}
  const trapped=states.findIndex((_,i)=>!canFinish.has(i));
  if(trapped>=0)findings.push(`Reachable state cannot reach an ending: region=${states[trapped]!.region}, completed=${states[trapped]!.completed.join(',')}, inventory=${JSON.stringify(states[trapped]!.inventory)}`);
  for(const region of d.regions)if(!states.some(s=>s.region===region))findings.push(`Unreachable region: ${region}`);
  for(const quest of d.quests)if(!states.some(s=>s.completed.includes(quest.id)))findings.push(`Unreachable quest: ${quest.id}`);
  const route:ProgressionAction[]=[];let cursor=winners[0];
  while(cursor!==undefined && parents[cursor]){const parent=parents[cursor]!;route.unshift(parent.action);cursor=parent.index;}
  return {ok:findings.length===0,complete:true,states:states.length,findings,route};
}
