// Engineering sample authored from wind-beacon.png. Back housing and depth are inferred.
// One meter ~= 310 reference pixels. +Y up, +Z front; named rotor group has a useful pivot.
export function createModel(THREE) {
  const root = new THREE.Group(); root.name = 'WindBeacon';
  const stone = new THREE.MeshStandardMaterial({color:0xb9a584,roughness:.92});
  const teal = new THREE.MeshStandardMaterial({color:0x397c83,roughness:.68,metalness:.12});
  const brass = new THREE.MeshStandardMaterial({color:0xb68b3c,roughness:.43,metalness:.62});
  const amber = new THREE.MeshStandardMaterial({color:0xffc447,emissive:0xffa719,emissiveIntensity:.7,roughness:.36});
  function mesh(parent,name,geometry,material,x,y,z) {
    const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);parent.add(m);return m;
  }
  mesh(root,'PlinthLower',new THREE.CylinderGeometry(.7,.77,.24,8),stone,0,.12,0);
  mesh(root,'PlinthUpper',new THREE.CylinderGeometry(.57,.66,.21,8),stone,0,.345,0);
  mesh(root,'FootSocket',new THREE.CylinderGeometry(.29,.32,.12,8),brass,0,.51,0);
  mesh(root,'Column',new THREE.CylinderGeometry(.19,.2,1.68,6),teal,0,1.37,-.05);
  mesh(root,'ColumnCollar',new THREE.CylinderGeometry(.235,.235,.12,8),brass,0,1.11,-.05);
  const rotor=new THREE.Group();rotor.name='RotorPivot';rotor.position.set(0,2.32,.17);root.add(rotor);
  const axle=mesh(root,'RearAxle',new THREE.CylinderGeometry(.16,.16,.44,12),brass,0,2.32,-.08);axle.rotation.x=Math.PI/2;
  function disc(name,radius,depth,z,material) {
    const m=mesh(rotor,name,new THREE.CylinderGeometry(radius,radius,depth,12),material,0,0,z);m.rotation.x=Math.PI/2;
  }
  disc('HubOuter',.31,.17,0,brass);disc('HubInner',.25,.12,.1,brass);disc('AmberLens',.16,.13,.17,amber);
  const bladeShape=new THREE.Shape();
  bladeShape.moveTo(-.08,.31);bladeShape.lineTo(-.22,1.02);bladeShape.lineTo(-.18,1.1);
  bladeShape.lineTo(.18,1.1);bladeShape.lineTo(.23,1.03);bladeShape.lineTo(.09,.31);bladeShape.closePath();
  for(let i=0;i<4;i++) {
    const assembly=new THREE.Group();assembly.name=`BladeAssembly${i+1}`;assembly.rotation.z=i*Math.PI/2;rotor.add(assembly);
    mesh(assembly,`TealPaddle${i+1}`,new THREE.ExtrudeGeometry(bladeShape,{depth:.06,bevelEnabled:true,bevelThickness:.012,bevelSize:.018,bevelSegments:1,steps:1}),teal,0,0,0);
    mesh(assembly,`BrassTab${i+1}`,new THREE.BoxGeometry(.13,.22,.09),brass,0,.35,.07);
    const bolt=mesh(assembly,`Bolt${i+1}`,new THREE.CylinderGeometry(.039,.039,.034,8),brass,0,.39,.135);bolt.rotation.x=Math.PI/2;
  }
  root.userData={reference:'wind-beacon.png',approximation:'Engineering blockout; rear axle inferred; materials simplified',rotorPivot:'RotorPivot'};
  return {root,animations:[]};
}
