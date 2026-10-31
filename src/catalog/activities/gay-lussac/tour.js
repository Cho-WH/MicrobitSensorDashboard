import { firstTrialReadings } from './first-trial-data.js';

// Actual values are retained as pairs; only the replay time axis is compressed.
// Water additions are staged for the tour, not recovered historical timestamps.
export const tour = {
  durationMs:180000,
  lineAt(ms){
    const [temperature,pressure]=firstTrialReadings[Math.min(firstTrialReadings.length-1,Math.floor(ms/100))];
    return `${temperature},0,${pressure}`;
  },
  notes:[
    ...[36,61,86,111,136,161].map(seconds=>({atMs:seconds*1000,note:'물 추가'})),
    {atMs:74700,note:'병 넘어짐'},
  ],
};
