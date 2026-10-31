// A bounded sequence shared by simulated sensors. Session owns recording and saving;
// this source only decides which prepared frame is emitted on each normal sensor tick.
export function createSampleReplay(frames, notes = []) {
  if (!frames.length) throw new Error('재생할 예시 자료가 없습니다.');
  const notesByFrame=new Map();
  for(const {frameIndex,note} of notes)notesByFrame.set(frameIndex,[...(notesByFrame.get(frameIndex)??[]),note]);
  let cursor=0, preview=0, previous='preview', owner=null, ended=false, last=frames[0];
  return {
    replaceFrames(next) {
      if(next.length!==frames.length)throw new Error('재연결한 예시 자료의 길이가 달라졌어요.');
      frames=next;last=frames[Math.max(0,cursor-1)];
    },
    read({state='preview',key=null}={}) {
      if(key!==owner || (state==='recording'&&!['recording','paused'].includes(previous))) {
        cursor=0;ended=false;owner=key;
      }
      previous=state;
      if(state==='recording') {
        if(ended)return {frame:last,ended:false};
        const pendingNotes=notesByFrame.get(cursor);
        last=frames[cursor++];ended=cursor===frames.length;
        return {frame:last,ended,...(pendingNotes ? {notes:pendingNotes} : {})};
      }
      if(['paused','finishing','ended'].includes(state))return {frame:last,ended:false};
      last=frames[preview++%frames.length];return {frame:last,ended:false};
    },
  };
}

export function prepareSampleFrames(lineAt,intervalMs,durationMs=60000) {
  if(!Number.isFinite(intervalMs)||intervalMs<=0||!Number.isFinite(durationMs)||durationMs<=0)
    throw new Error('예시 자료의 재생 간격을 확인하세요.');
  return Array.from({length:Math.max(1,Math.ceil(durationMs/intervalMs))},(_,i)=>lineAt(i*intervalMs));
}
