// Reconstructed from gear-machine.png: +Y up, +Z front. Rear panel is inferred.
export function createModel(T) {
  const root=new T.Group();root.name='WorkshopGearMachine';
  const material=(color,metalness=0,roughness=.78)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const teal=material(0x397c83,.16), edge=material(0x244c53,.25),brass=material(0xb68b3c,.4,.56),stone=material(0xcbb795),dark=material(0x293e43);
  const amber=new T.MeshStandardMaterial({color:0xf3ae34,emissive:0xee8e16,emissiveIntensity:.35,roughness:.38});
  function mesh(parent,name,g,m,x,y,z){const n=new T.Mesh(g,m);n.name=name;n.position.set(x,y,z);parent.add(n);return n;}
  const box=(p,n,w,h,d,m,x,y,z)=>mesh(p,n,new T.BoxGeometry(w,h,d),m,x,y,z);
  function bolt(p,n,x,y,z,r=.065){const b=mesh(p,n,new T.CylinderGeometry(r,r,.055,8),brass,x,y,z);b.rotation.x=Math.PI/2;return b;}
  box(root,'PlinthLower',3.3,.18,1.35,stone,0,.09,0);
  box(root,'PlinthUpper',3.05,.18,1.16,stone,0,.27,0);
  for(const x of [-1.17,1.17])for(const z of [-.35,.35]) {
    box(root,`Foot${x}_${z}`,.23,.22,.24,brass,x,.45,z);
  }
  box(root,'Cabinet',2.8,2.28,.85,teal,0,1.7,0);
  box(root,'TopLid',2.92,.13,.96,teal,0,2.9,0);
  box(root,'FrontInset',2.5,1.97,.04,edge,0,1.7,.445);
  box(root,'FrontPanel',2.43,1.9,.035,teal,0,1.7,.48);
  for(const x of [-1.35,1.35])box(root,`TrimVertical${x}`,.035,2.16,.03,brass,x,1.7,.445);
  for(const y of [.63,2.77])box(root,`TrimHorizontal${y}`,2.7,.032,.03,brass,0,y,.445);
  for(const x of [-1.24,1.24])for(const y of [.71,2.69])bolt(root,`CornerBolt${x}_${y}`,x,y,.49);
  for(const x of [-1.43,1.43]) {
    box(root,`SideAccessPanel${x}`,.025,1.8,.64,edge,x,1.7,0);
    box(root,`SideAccessInset${x}`,.03,1.7,.55,teal,x,1.7,0);
  }
  box(root,'RearServicePanel',2.4,1.85,.03,edge,0,1.72,-.44);
  for(const x of [-1.17,1.17])for(const z of [-.34,.34])mesh(root,`LidBolt${x}_${z}`,new T.CylinderGeometry(.07,.07,.04,8),brass,x,2.98,z);
  function gear(name,x,y,r,teeth) {
    const pivot=new T.Group();pivot.name=name;pivot.position.set(x,y,.59);root.add(pivot);
    const shape=new T.Shape();
    for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*Math.PI*2,rad=(i%4===1||i%4===2)?r:r*.86;const px=Math.sin(a)*rad,py=Math.cos(a)*rad;if(i===0)shape.moveTo(px,py);else shape.lineTo(px,py);}shape.closePath();
    const hole=new T.Path();hole.absarc(0,0,r*.68,0,Math.PI*2,true);shape.holes.push(hole);
    mesh(pivot,name+'Teeth',new T.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelThickness:.014,bevelSize:.014,bevelSegments:1,steps:1,curveSegments:24}),brass,0,0,0);
    for(let i=0;i<3;i++){const group=new T.Group();group.name=`${name}Spoke${i+1}`;group.rotation.z=i*Math.PI*2/3;pivot.add(group);box(group,'Spoke',.095,r*.7,.11,brass,0,r*.32,.065);}
    const hub=mesh(pivot,name+'Hub',new T.CylinderGeometry(r*.22,r*.22,.16,16),teal,0,0,.105);hub.rotation.x=Math.PI/2;
    bolt(pivot,name+'Axle',0,0,.22,r*.1);
    // Subtle teal index pin makes quarter-turn puzzle orientation visible.
    box(pivot,name+'Index',.055,.12,.025,teal,0,r*.9,.18);
  }
  gear('GearLeftPivot',-.67,2.02,.72,16);gear('GearRightPivot',.68,1.94,.60,12);
  mesh(root,'EnergySocket',new T.CylinderGeometry(.115,.115,.35,10),amber,0,.95,.61);
  for(const y of [.73,1.17])mesh(root,`SocketRim${y}`,new T.CylinderGeometry(.17,.17,.065,12),brass,0,y,.61);
  for(const x of [-.13,.13])box(root,`SocketGuard${x}`,.035,.4,.055,brass,x,.95,.71);
  root.userData={reference:'gear-machine.png',pivots:['GearLeftPivot','GearRightPivot'],approximation:'Hidden rear inferred; weathering simplified'};
  return {root,animations:[]};
}
