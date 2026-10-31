import { MILLI_G_TO_SI } from '../../../domain/acceleration-units.js';

// A fixed 20 cm radius. Integrating each smooth speed ramp keeps magnetic phase
// continuous; one magnetic peak corresponds to one complete revolution.
const slow = 2 * Math.PI / 1.5, fast = 2 * Math.PI / .95;
const stages = [[0,8,0,0],[8,23,0,slow],[23,78,slow,slow],
  [78,93,slow,fast],[93,158,fast,fast],[158,178,fast,0],[178,180,0,0]];
function rotationAt(seconds) {
  let phase=0;
  for(const [start,end,from,to] of stages){
    const duration=end-start,elapsed=Math.max(0,Math.min(seconds-start,duration)),u=elapsed/duration;
    phase+=from*elapsed+(to-from)*duration*(u**3-.5*u**4);
    if(seconds<end)return {phase,omega:from+(to-from)*(3*u**2-2*u**3)};
  }
  return {phase,omega:0};
}
export const tour = {
  durationMs:180000,
  setup:{centripetalRadiusM:'0.2'},
  lineAt(ms){
    const t=ms/1000,{phase,omega}=rotationAt(t);
    const x=.2*omega**2*1.006+.018*Math.sin(t*11),y=.012*Math.sin(t*7),z=-9.8+.012*Math.sin(t*9);
    const fields=[x,y,z,Math.hypot(x,y,z)].map(value=>Math.round(value/MILLI_G_TO_SI));
    const magnetic=35+75*Math.exp(6*(Math.cos(phase)-1))+.15*Math.sin(t*13);
    return [...fields,magnetic.toFixed(2)].join(',');
  },
};
