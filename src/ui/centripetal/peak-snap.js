// Pixel proximity keeps the attraction equally light at every chart scale.
// Peaks are sorted by receipt time, just like the recorded samples.
export function snapToPeak(at, peaks, geometry, limits, radius = 6) {
  let low=0,high=peaks.length;
  while(low<high){const middle=(low+high)>>>1;if(peaks[middle].receivedAt<at)low=middle+1;else high=middle;}
  let result=at,distance=radius;
  const pointer=geometry.pixel(at);
  for(const peak of [peaks[low-1],peaks[low]]){
    if(!peak||peak.receivedAt<limits.startAt||peak.receivedAt>limits.endAt)continue;
    const pixel=geometry.pixel(peak.receivedAt),delta=Math.abs(pixel-pointer);
    if(pixel<geometry.left||pixel>geometry.left+geometry.width)continue;
    if(delta<=distance){result=peak.receivedAt;distance=delta;}
  }
  return result;
}
