// One 1.27 mm edge-connector grid. Each large pad spans four adjacent columns.
// The resulting ring centers match the official 4.21/14.37/25.80/37.23/47.39 mm drawing.
// Board-front coordinates; the rear view mirrors X.
const pitch=1.27,fingerWidth=.86,columnCount=40,ringFirstColumns=Object.freeze([1,9,18,27,35]);
const columnX=column=>(column-(columnCount-1)/2)*pitch;
export const contactLayout=Object.freeze({
  x:Object.freeze(ringFirstColumns.map(first=>columnX(first+1.5))),y:-14.5,radius:2,
  pitch,fingerWidth,columnCount,ringFirstColumns,
  padHalfWidth:(3*pitch+fingerWidth)/2,padOuterRadius:2.9,
  bottom:-20.94,fingerTop:-16.25,
  fingers:Object.freeze(Array.from({length:columnCount},(_,column)=>column)
    .filter(column=>!ringFirstColumns.some(first=>column>=first&&column<first+4))
    .map(column=>Object.freeze({column,x:columnX(column)}))),
});

// Clip each rear-face stroke against the plated bores, including half its width.
// Surface graphics must never bridge a physical opening in the board.
export function clipRearStroke(points,width=.12) {
  const result=[],radius=contactLayout.radius+.1+width/2;
  for(let i=1;i<points.length;i++){
    const [a,b]=[points[i-1],points[i]],dx=b[0]-a[0],dy=b[1]-a[1],lengthSquared=dx*dx+dy*dy;
    if(lengthSquared<1e-12)continue;
    let spans=[[0,1]];
    for(const x of contactLayout.x){
      const ox=a[0]+x,oy=a[1]-contactLayout.y;
      const linear=2*(ox*dx+oy*dy),constant=ox*ox+oy*oy-radius*radius;
      const discriminant=linear*linear-4*lengthSquared*constant;
      if(discriminant<=0)continue;
      const t0=(-linear-Math.sqrt(discriminant))/(2*lengthSquared),t1=(-linear+Math.sqrt(discriminant))/(2*lengthSquared);
      spans=spans.flatMap(([lo,hi])=>{
        if(t1<=lo||t0>=hi)return [[lo,hi]];
        const kept=[];if(t0>lo)kept.push([lo,t0]);if(t1<hi)kept.push([t1,hi]);return kept;
      });
    }
    for(const [lo,hi] of spans)if(hi-lo>1e-8)result.push([[a[0]+dx*lo,a[1]+dy*lo],[a[0]+dx*hi,a[1]+dy*hi]]);
  }
  return result;
}
