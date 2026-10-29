// Presentation only. Session/Transport still enforce their own action guards.
// CSS may style these states but must not choose which recording actions exist.
/** @param {{state:string,pointMode:boolean,hasRun:boolean,hasSession:boolean,recording:boolean,
 * busy:boolean,ready:boolean,saveFailed:boolean,recordingSupported:boolean,
 * needsConnection:boolean,connectionDisabled:boolean,finishingFrom?:string}} facts */
export function getRecordingActions(facts) {
  const { state, pointMode, hasRun, hasSession, recording, busy, ready, saveFailed,
    recordingSupported, needsConnection, connectionDisabled, finishingFrom = 'recording' } = facts;
  const controlState = state === 'finishing' ? finishingFrom : state;
  const action = (visible, disabled) => ({ visible, disabled: Boolean(disabled) });
  return {
    'measurement-reconnect': action(needsConnection, connectionDisabled),
    'start-recording': action(state === 'preview' && !pointMode && !needsConnection, hasRun || busy || !ready || !recordingSupported),
    'pause-recording': action(controlState === 'recording' && !needsConnection, state !== 'recording' || !recording || busy),
    'resume-recording': action(controlState === 'paused' && !needsConnection, state !== 'paused' || busy || !ready || saveFailed),
    'finish-recording': action(['recording','paused','finishing'].includes(state), !hasSession || ['ended','preview'].includes(state) || busy),
    'prepare-new-experiment': action(hasRun, busy),
    'additional-recording': action(state === 'ended' && hasSession && !needsConnection, busy || !ready),
  };
}
