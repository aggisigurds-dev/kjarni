/**
 * Door-gap detection for rotated architectural floor plans.
 *
 * The existing gap detector expects almost horizontal/vertical walls (1.5°).
 * On drawings such as Dalshraun 1 some whole wall groups are ~4.6° rotated.
 * Rotate the candidate coordinate system, run the established conservative
 * detector, then transform geometry and the image-verification callbacks back.
 * Only accept additional tilted doors with visual arc confirmation. Do not
 * change the authoritative saved wall geometry.
 */
import { finnaHurdir, type HurdaStillingar, type Hurd, type HurdKandidat } from "./hurdagreining";
import { iButa, type HLina } from "./veggja-hreinsun";
type P = [number,number];

function rotate(p:P,a:number):P {
  const c=Math.cos(a),s=Math.sin(a);
  return [p[0]*c-p[1]*s,p[0]*s+p[1]*c];
}
function rotateLine(line:HLina, a:number):HLina {
  const p:number[]=[];
  for(let i=0;i<line.p.length;i+=2) p.push(...rotate([line.p[i],line.p[i+1]],a));
  return {...line,p};
}
function rotationCandidates(lines:HLina[], dpm:number):number[] {
  // A single long sloping partition is not evidence that the drawing is rotated.
  // Group neighboring one-degree bins: 4.49° and 4.51° belong to the same
  // drawing orientation, not two competing orientations.
  const bins=new Map<number,{weight:number;count:number;weightedAngle:number}>();
  for(const l of iButa(lines)) {
    if(l.p.length!==4||!["veggur","ei30","ei60"].includes(l.tegund??"veggur"))continue;
    const dx=l.p[2]-l.p[0],dy=l.p[3]-l.p[1];
    const length=Math.hypot(dx,dy);
    if(!Number.isFinite(length)||length<Math.max(5,dpm*0.12))continue;
    const deg=Math.atan2(dy,dx)*180/Math.PI;
    const shift=((deg+45)%90+90)%90-45;
    if(Math.abs(shift)<2||Math.abs(shift)>15)continue;
    const bin=Math.round(shift);
    const prev=bins.get(bin)??{weight:0,count:0,weightedAngle:0};
    prev.weight+=length;
    prev.count++;
    prev.weightedAngle+=shift*length;
    bins.set(bin,prev);
  }
  const angles:number[]=[];
  for(const [seed] of [...bins].sort((a,b)=>b[1].weight-a[1].weight)) {
    let weight=0,count=0,weightedAngle=0;
    for(let bin=seed-1;bin<=seed+1;bin++){
      const x=bins.get(bin);
      if(!x)continue;
      weight+=x.weight;count+=x.count;weightedAngle+=x.weightedAngle;
    }
    if(count<2||weight<dpm*0.75)continue;
    const angle=weightedAngle/weight;
    if(angles.some(a=>Math.abs(a-angle)<1.75))continue;
    angles.push(angle);
    if(angles.length===2)break;
  }
  return angles;
}
export interface RotatedDoors {
  doors:Hurd[];
  candidates:HurdKandidat[];
  angles:number[];
}
export function finnaSnunarHurdir(
  veggir:HLina[], adrar:HLina[], dpm:number, settings:HurdaStillingar={}
):RotatedDoors {
  if(!(dpm>0)||!Number.isFinite(dpm))return {doors:[],candidates:[],angles:[]};
  const angles=rotationCandidates(veggir,dpm);
  const doors:Hurd[]=[];
  const candidates:HurdKandidat[]=[];
  for(const deg of angles) {
    const rad=deg*Math.PI/180;
    const mapBack=(p:number[]):[number,number,number,number]=>{
      const a=rotate([p[0],p[1]],rad),b=rotate([p[2],p[3]],rad);
      return [a[0],a[1],b[0],b[1]];
    };
    const rotated=finnaHurdir(veggir.map(v=>rotateLine(v,-rad)),adrar.map(v=>rotateLine(v,-rad)),dpm,{
      ...settings,
      bogi:(a,b,t)=>{
        const x=rotate(a,rad),y=rotate(b,rad);
        return settings.bogi?.(x,y,t)??false;
      },
      linaIBili:settings.linaIBili? (a,b,t)=>settings.linaIBili!(rotate(a,rad),rotate(b,rad),t):undefined,
    });
    for(const c of rotated.kandidatar) {
      const p=mapBack(c.p);
      const mx=(p[0]+p[2])/2,my=(p[1]+p[3])/2;
      if(candidates.some(other=>Math.hypot(mx-(other.p[0]+other.p[2])/2,my-(other.p[1]+other.p[3])/2)<dpm*0.25))continue;
      // The base detector may classify an ordinary 90 cm gap as a door even
      // without an arc. Supplemental rotated candidates are *not* accepted
      // doors until a separate arc check succeeds; never display them as such.
      const accepted=c.bogi&&(c.nidurstada==="hurd"||c.nidurstada==="bilahurd");
      candidates.push({...c,p,nidurstada:accepted?c.nidurstada:null});
    }
    for(const h of rotated.hurdir) {
      // Avoid false positives from tiny alignment differences and drawing
      // dimensions. These supplemental doors require independent arc evidence.
      if(!h.bogi)continue;
      const p=mapBack(h.p);
      const mx=(p[0]+p[2])/2,my=(p[1]+p[3])/2;
      if(doors.some(d=>Math.hypot(mx-(d.p[0]+d.p[2])/2,my-(d.p[1]+d.p[3])/2)<dpm*0.25))continue;
      doors.push({...h,p});
    }
  }
  return {doors,candidates,angles};
}
