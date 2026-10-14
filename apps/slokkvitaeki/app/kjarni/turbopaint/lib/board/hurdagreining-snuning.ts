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
function rotationCandidates(lines:HLina[]):number[] {
  const bins=new Map<number,number>();
  for(const l of iButa(lines)) {
    if (l.p.length!==4) continue;
    const dx=l.p[2]-l.p[0],dy=l.p[3]-l.p[1];
    const length=Math.hypot(dx,dy);
    if(length<5) continue;
    const deg=Math.atan2(dy,dx)*180/Math.PI;
    const shift=((deg+45)%90+90)%90-45;
    if(Math.abs(shift)<2||Math.abs(shift)>15)continue;
    const bin=Math.round(shift);
    bins.set(bin,(bins.get(bin)||0)+length);
  }
  return [...bins].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([deg])=>deg);
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
  const angles=rotationCandidates(veggir);
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
      candidates.push({...c,p});
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
