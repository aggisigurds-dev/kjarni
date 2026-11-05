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
  assert.ok(uncertain.candidates.length>0,"tilted wall gap should be reported as a candidate");
  assert.ok(uncertain.candidates.every(c=>c.nidurstada===null),"unverified gaps must not be labeled as doors or glass");
  assert.ok(uncertain.angles.some(x=>Math.abs(x-4.6)<1.2));
  const supported=finnaSnunarHurdir(tilted,[],DPM,{bogi:()=>true});
  assert.equal(supported.doors.length,1);
  assert.ok(supported.candidates.some(c=>c.nidurstada==="hurd"&&c.bogi));
  const p=supported.doors[0].p;
  const expected=turn([500,300,500,390],4.6);
  assert.ok(p.every((n,i)=>Math.abs(n-expected[i])<2));
});
test("does not change axis-aligned plans or label arbitrary gaps",()=>{
  const r=finnaSnunarHurdir(example,[],DPM,{bogi:()=>true});
  assert.equal(r.doors.length,0);
  assert.deepEqual(r.angles,[]);
});

test("a lone sloping wall is not mistaken for a rotated drawing",()=>{
  const r=finnaSnunarHurdir([line(turn([0,0,1200,0],8))],[],DPM,{bogi:()=>true});
  assert.deepEqual(r.angles,[]);
  assert.equal(r.doors.length,0);
});
test("neighboring angular bins are treated as one orientation",()=>{
  const walls=[line(turn([0,0,300,0],4.49)),line(turn([400,0,700,0],4.51))];
  const r=finnaSnunarHurdir(walls,[],DPM);
  assert.equal(r.angles.length,1);
  assert.ok(Math.abs(r.angles[0]-4.5)<0.2);
});
test("image callbacks receive original coordinates, not temporary rotated coordinates",()=>{
  const tilted=example.map(l=>({...l,p:turn(l.p,4.6)}));
  const expected=turn([500,300,500,390],4.6);
  let seen=false;
  const r=finnaSnunarHurdir(tilted,[],DPM,{
    bogi:(a,b)=>{
      const match=Math.hypot(a[0]-expected[0],a[1]-expected[1])<2
        && Math.hypot(b[0]-expected[2],b[1]-expected[3])<2;
      if(match)seen=true;
      return match;
    }
  });
  assert.ok(seen);
  assert.equal(r.doors.length,1);
});
test("an already tagged glass pane prevents a rotated door even with arc evidence",()=>{
  const tilted=example.map(l=>({...l,p:turn(l.p,4.6)}));
  const pane:HLina={p:turn([500,300,500,390],4.6),t:8,tegund:"gler"};
  const r=finnaSnunarHurdir(tilted,[pane],DPM,{bogi:()=>true});
  assert.equal(r.doors.length,0);
  assert.ok(r.candidates.every(c=>c.nidurstada===null));
});
