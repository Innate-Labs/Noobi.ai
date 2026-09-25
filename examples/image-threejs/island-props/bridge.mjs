import {mergeGeometries} from '/utils/BufferGeometryUtils.js';
// Reconstructed from bridge.png. Deck top y=0; length along Z, ends at +/-7m.
export function createModel(T) {
  const root=new T.Group();root.name='RepairableBridge';
  const teal=new T.MeshStandardMaterial({color:0x397078,metalness:.18,roughness:.76});
  const brass=new T.MeshStandardMaterial({color:0xb68b3c,metalness:.38,roughness:.56});
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#b69a6b';ctx.fillRect(0,0,512,256);
  let seed=19;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<200;i++){const y=random()*256;ctx.strokeStyle=i%3?'rgba(102,69,30,.10)':'rgba(238,211,156,.22)';ctx.lineWidth=.4+random();ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(140,y-5+random()*10,360,y-6+random()*12,512,y);ctx.stroke();}
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const oak=new T.MeshStandardMaterial({map,roughness:.88});
  function box(name,w,h,d,material,x,y,z){const n=new T.Mesh(new T.BoxGeometry(w,h,d),material);n.name=name;n.position.set(x,y,z);root.add(n);return n;}
  for(let i=0;i<7;i++)box(`DeckPanel${i+1}`,3,.22,1.98,oak,0,-.11,-6+i*2);
  for(const side of [-1,1]) {
    box(`Girder${side}`, .19,.58,14,teal,side*1.55,-.31,0);
    for(const y of [.35,.86])box(`Rail${side}_${y}`,.065,.065,14,brass,side*1.55,y,0);
    for(let i=0;i<8;i++) {
      const z=-7+i*2;
      box(`Post${side}_${i+1}`,.18,1.02,.18,teal,side*1.55,.45,z);
      box(`Cap${side}_${i+1}`,.24,.07,.24,brass,side*1.55,1,z);
      box(`FootPlate${side}_${i+1}`,.3,.09,.3,brass,side*1.55,.015,z);
      box(`GirderBracket${side}_${i+1}`,.055,.53,.26,brass,side*1.68,-.3,z);
      for(const y of [-.15,-.44]) {
        const bolt=new T.Mesh(new T.CylinderGeometry(.055,.055,.035,8),brass);bolt.name=`Bolt${side}_${i+1}_${y}`;
        bolt.rotation.z=Math.PI/2;bolt.position.set(side*1.72,y,z);root.add(bolt);
      }
    }
  }
  for(let i=0;i<8;i++)box(`CrossMember${i+1}`,3.15,.18,.18,teal,0,-.43,-7+i*2);
  // Static metal parts share material draw calls; seven editable deck panels stay distinct.
  for(const [material,name] of [[teal,'StaticTealStructure'],[brass,'StaticBrassHardware']]) {
    const pieces=root.children.filter(n=>n.isMesh && n.material===material), geometries=[];
    for(const piece of pieces){piece.updateMatrix();geometries.push(piece.geometry.clone().applyMatrix4(piece.matrix));root.remove(piece);}
    const merged=mergeGeometries(geometries,false);if(!merged)throw Error('Bridge merge failed');
    const mesh=new T.Mesh(merged,material);mesh.name=name;root.add(mesh);
    for(const geometry of geometries)geometry.dispose();
  }
  root.userData={reference:'bridge.png',deckTop:0,length:14,approximation:'Underside inferred; grain procedural'};
  return {root,animations:[]};
}
