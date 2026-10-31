// Keep untyped vendor modules outside the app's checkJs boundary. The scene build
// resolves these literal URLs to static imports before bundling.
const { Scene, Group, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight,
  Mesh, MeshBasicMaterial, PlaneGeometry, CanvasTexture, BufferGeometry, Line, LineBasicMaterial,
  CubicBezierCurve3, TubeGeometry, CylinderGeometry, Vector3, SRGBColorSpace, ACESFilmicToneMapping,
}=await import(new URL('../../../../public/vendor/three-r180.js',import.meta.url).href);
const {createMicrobitV2,setMicrobitLed}=await import(new URL('../../../../public/assets/devices/microbit-v2/model.js',import.meta.url).href);

// Board-local front is +Z. Lay it LED-side up, then tilt around a fixed center.
// The camera never moves and every pose keeps the LED face visible.
// Time, lowered edge (right/front = positive), board heading. The same path drives the LEDs.
const poses=[
  [0,0,0,0], [.6,0,0,0], [2,0,1,0], [3,-1,1,.4], [4.2,-1,0,.9],
  [5.8,1,1,-.4], [7,1,0,-.7], [7.8,.5,-.5,-1.5], [8.8,1,-1,-1.8],
  [10,0,-1,-2.1], [11.2,-1,-1,-2.1], [12.5,0,0,-2.1], [14,0,0,0], [16,0,0,0],
];
const smooth=value=>(1-Math.cos(Math.PI*Math.max(0,Math.min(1,value))))/2;
function poseAt(time) {
  const index=poses.findIndex((pose,i)=>i>0&&time<=pose[0]), start=poses[index-1], end=poses[index];
  const t=(time-start[0])/(end[0]-start[0]), ease=smooth(t);
  return {x:start[1]+(end[1]-start[1])*ease,y:start[2]+(end[2]-start[2])*ease,
    yaw:start[3]+(end[3]-start[3])*ease,dx:end[1]-start[1],dy:end[2]-start[2],t};
}
// Precompute the trail so skipped frames, resizing and resuming cannot leave holes.
// This is an illustrative sweep, not the board firmware's calibration algorithm.
const litAt=new Float64Array(25).fill(Infinity);
for(let time=.6;time<=12.8;time+=1/60) {
  const {x,y}=poseAt(time);
  for(let row=0;row<5;row++)for(let col=0;col<5;col++) {
    if(Math.hypot(col-(2+x*2),row-(2+y*2))<.85)litAt[row*5+col]=Math.min(litAt[row*5+col],time);
  }
}

/** @param {HTMLCanvasElement} canvas */
export function createCalibrationScene(canvas) {
  const renderer=new WebGLRenderer({canvas,antialias:true,alpha:true});
  const scene=new Scene(), heading=new Group(), tilt=new Group(), ownedMaterials=new Set(), ownedTextures=new Set();
  let disposed=false;
  function dispose() {
    if(disposed)return;disposed=true;
    const geometry=new Set(); scene.traverse(node=>{if(node.geometry)geometry.add(node.geometry);});
    geometry.forEach(value=>value.dispose()); ownedMaterials.forEach(value=>value.dispose());
    ownedTextures.forEach(value=>value.dispose()); renderer.dispose(); renderer.forceContextLoss();
  }
  try {
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.outputColorSpace=SRGBColorSpace;
    renderer.toneMapping=ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
    renderer.setClearColor('#edf1eb',0);
    scene.add(new HemisphereLight('#ffffff','#a2aea4',2.6));
    for(const [x,y,z,color,power] of [[-70,100,80,'#ffffff',3.3],[80,45,-50,'#d7eaff',2.4]]) {
      const light=new DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
    }
    const camera=new PerspectiveCamera(32,1,2,500);
    camera.zoom=.88;camera.updateProjectionMatrix();
    camera.position.set(30,115,125);camera.lookAt(0,22,0);
    const board=createMicrobitV2();board.rotation.x=-Math.PI/2;heading.position.y=32;tilt.add(board);heading.add(tilt);scene.add(heading);
    // Shared model materials/textures stay alive for other consumers. Own this renderer's copies.
    const materials=new Map(), textures=new Map();
    board.traverse(node=>{
      if(!node.material)return;
      if(!materials.has(node.material)) {
        const material=node.material.clone(); materials.set(node.material,material);ownedMaterials.add(material);
        if(material.map) {
          if(!textures.has(material.map)) {const texture=material.map.clone();texture.needsUpdate=true;textures.set(material.map,texture);ownedTextures.add(texture);}
          material.map=textures.get(material.map);
        }
      }
      node.material=materials.get(node.material);
    });
    const material=options=>{const value=new MeshBasicMaterial(options);ownedMaterials.add(value);return value;};
    const plane=new Mesh(new PlaneGeometry(76,58),material({color:'#9bb9b2',transparent:true,opacity:.09,depthWrite:false}));
    plane.rotation.x=-Math.PI/2;plane.position.y=-3;scene.add(plane);
    const lineMaterial=new LineBasicMaterial({color:'#8fa9a3',transparent:true,opacity:.28});ownedMaterials.add(lineMaterial);
    const boundary=new Line(new BufferGeometry().setFromPoints([[-38,-3,-29],[38,-3,-29],[38,-3,29],[-38,-3,29],[-38,-3,-29]].map(p=>new Vector3(...p))),lineMaterial);scene.add(boundary);
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
    const context=shadowCanvas.getContext('2d'), gradient=context.createRadialGradient(64,64,8,64,64,64);
    gradient.addColorStop(0,'rgba(40,65,61,.24)');gradient.addColorStop(.5,'rgba(40,65,61,.12)');gradient.addColorStop(1,'rgba(40,65,61,0)');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);
    const shadowTexture=new CanvasTexture(shadowCanvas);ownedTextures.add(shadowTexture);
    const shadow=new Mesh(new PlaneGeometry(76,58),material({map:shadowTexture,transparent:true,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=-2.8;scene.add(shadow);

    // A single descending edge cue, following the direction of the current tilt.
    const arrow=new Group(), arrowMaterial=material({color:'#327f7b',transparent:true,opacity:0,depthWrite:false,depthTest:false});
    const curve=new CubicBezierCurve3(new Vector3(0,9,32),new Vector3(0,5,36),new Vector3(0,-2,36),new Vector3(0,-7,32));
    arrow.add(new Mesh(new TubeGeometry(curve,24,.55,8,false),arrowMaterial));
    const tip=new Mesh(new CylinderGeometry(0,1.8,4,16),arrowMaterial), tangent=curve.getTangent(1);
    tip.position.copy(curve.getPoint(1)).addScaledVector(tangent,1.3);tip.quaternion.setFromUnitVectors(new Vector3(0,1,0),tangent);
    arrow.add(tip);arrow.position.y=32;scene.add(arrow);
    const axis=new Vector3();
    return {
      resize(width,height) {renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();},
      render(seconds) {
        const time=seconds%16, {x,y,yaw,dx,dy,t}=poseAt(time), radius=Math.hypot(x,y);
        const angle=Math.min(1,radius)*(1.13-.08*Math.abs(x)/(Math.abs(x)+Math.abs(y)||1));
        heading.rotation.y=yaw;
        axis.set(y,0,-x).normalize();if(!radius)axis.set(1,0,0);
        tilt.quaternion.setFromAxisAngle(axis,angle);
        shadow.scale.set(Math.cos(angle*x/(radius||1)),Math.cos(angle*y/(radius||1)),1);shadow.rotation.z=yaw;
        arrow.rotation.y=Math.atan2(dx,dy)+yaw;arrowMaterial.opacity=Math.hypot(dx,dy)>.01?Math.sin(Math.PI*t)*.8:0;
        const cursorColumn=Math.round(2+x*2), cursorRow=Math.round(2+y*2), fade=1-smooth((time-15.3)/.7);
        for(let row=0;row<5;row++)for(let col=0;col<5;col++) {
          const fresh=smooth((time-litAt[row*5+col])/.18);
          const brightness=time>=12.8?.65:col===cursorColumn&&row===cursorRow?1:.5;
          setMicrobitLed(board,col,row,fresh*brightness*fade);
        }
        renderer.render(scene,camera);
      },
      dispose,
    };
  } catch(error) {dispose();throw error;}
}
