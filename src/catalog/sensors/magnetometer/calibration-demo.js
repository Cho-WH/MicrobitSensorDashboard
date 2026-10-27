import { element } from '../../../ui/dom.js';

/** A visible-only demonstration; it never reports device calibration progress. */
export function createCalibrationDemo(host) {
  const stage=element('div','magnetic-demo'), poster=element('img'), canvas=element('canvas');
  stage.setAttribute('role','img');
  stage.setAttribute('aria-label','micro:bit를 앞뒤·좌우로 천천히 기울이면 기울인 쪽의 LED가 켜지고, 화면이 채워지는 시범');
  poster.src=new URL('./calibration.png',import.meta.url).href; poster.alt='';
  poster.setAttribute('aria-hidden','true'); canvas.setAttribute('aria-hidden','true'); canvas.hidden=true;
  stage.append(poster); host.append(stage);
  const abort=new AbortController();
  let active=false, intersecting=false, disposed=false, failed=false, loading=false, frame=0;
  let elapsed=0, previous=0, lastDraw=0;
  /** @type {{resize:(width:number,height:number)=>void,render:(seconds:number)=>void,dispose:()=>void}|null} */
  let scene=null;
  const visible=()=>active&&intersecting&&!document.hidden&&stage.checkVisibility();
  function stop() { cancelAnimationFrame(frame); frame=0; previous=0; }
  function fallback() { failed=true; stop(); canvas.hidden=true; poster.hidden=false; scene?.dispose(); scene=null; }
  function draw(time) {
    frame=0;
    if(disposed||!visible()) { previous=0; return; }
    if(previous)elapsed+=Math.min(time-previous,100);
    previous=time;
    if(time-lastDraw>=1000/30) {
      try { scene.render(elapsed/1000); lastDraw=time; }
      catch { fallback(); return; }
    }
    frame=requestAnimationFrame(draw);
  }
  function resize() {
    const {width,height}=stage.getBoundingClientRect();
    if(scene&&width>0&&height>0)scene.resize(width,height);
  }
  async function sync() {
    if(disposed||failed)return;
    if(!visible()) { stop(); return; }
    if(!scene) {
      if(loading)return;
      loading=true;
      try {
        // Keep the shared 3D runtime out of ordinary preparation screens.
        const {createCalibrationScene}=await import(new URL('./calibration-scene.js',import.meta.url).href);
        if(disposed||!visible())return;
        scene=createCalibrationScene(canvas); resize(); scene.render(elapsed/1000);stage.append(canvas);
        canvas.hidden=false; poster.hidden=true;
      } catch { if(!disposed)fallback(); }
      finally { loading=false; }
    }
    if(scene&&!frame)frame=requestAnimationFrame(draw);
  }
  const intersection=new IntersectionObserver(([entry])=>{intersecting=entry.isIntersecting;void sync();});
  const size=new ResizeObserver(()=>{resize();void sync();});
  intersection.observe(stage); size.observe(stage);
  document.addEventListener('visibilitychange',()=>void sync(),{signal:abort.signal});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();},{signal:abort.signal});
  return {
    setActive(value) {
      // This teaches the required physical action, including with reduced motion enabled.
      active=Boolean(value);
      if(!active) { stop(); canvas.hidden=true; poster.hidden=false; elapsed=0; }
      else if(scene&&!failed) { canvas.hidden=false; poster.hidden=true; }
      void sync();
    },
    dispose() { disposed=true;stop();abort.abort();intersection.disconnect();size.disconnect();scene?.dispose();stage.remove(); },
  };
}
