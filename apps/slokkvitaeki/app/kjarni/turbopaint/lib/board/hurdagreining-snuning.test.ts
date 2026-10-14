import assert from "node:assert/strict";
import {test} from "node:test";
import {finnaSnunarHurdir} from "./hurdagreining-snuning";
import {finnaHurdir} from "./hurdagreining";
import type {HLina} from "./veggja-hreinsun";

const DPM=100;
function turn(p:number[],deg:number):number[] {
  const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),out:number[]=[];
  for(let i=0;i<p.length;i+=2)out.push(p[i]*c-p[i+1]*s,p[i]*s+p[i+1]*c);
  return out;
}
const line=(p:number[]):HLina=>({p,t:15});
const example=[
  line([0,0,1000,0]),line([0,800,1000,800]),
  line([0,0,0,800]),line([1000,0,1000,800]),
  line([500,0,500,300]),line([500,390,500,800])
];
test("recognizes rotated candidate only when an arc confirms it",()=>{
  const tilted=example.map(l=>({...l,p:turn(l.p,4.6)}));
  const baseline=finnaHurdir(tilted,[],DPM);
  assert.equal(baseline.hurdir.length,0);
  const uncertain=finnaSnunarHurdir(tilted,[],DPM);
  assert.equal(uncertain.doors.length,0);
  assert.ok(uncertain.angles.some(x=>Math.abs(x-4.6)<1.2));
  const supported=finnaSnunarHurdir(tilted,[],DPM,{bogi:()=>true});
  assert.equal(supported.doors.length,1);
  const p=supported.doors[0].p;
  const expected=turn([500,300,500,390],4.6);
  assert.ok(p.every((n,i)=>Math.abs(n-expected[i])<2));
});
test("does not change axis-aligned plans or label arbitrary gaps",()=>{
  const r=finnaSnunarHurdir(example,[],DPM,{bogi:()=>true});
  assert.equal(r.doors.length,0);
  assert.deepEqual(r.angles,[]);
});
