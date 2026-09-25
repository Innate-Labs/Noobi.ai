import { useEffect, useRef, useState } from 'react';

// Share one renderer and serialize thumbnails so large libraries never allocate
// one WebGL context per card. Only cards near the viewport request a thumbnail.
let queue: Promise<unknown> = Promise.resolve();
let renderer: import('three').WebGLRenderer | undefined;
async function thumbnail(url: string): Promise<string> {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(480, 300, false);
  renderer.setPixelRatio(1);
  const model = await new GLTFLoader().loadAsync(url);
  const scene = new THREE.Scene();
  try {
    scene.add(model.scene);
    const bounds = new THREE.Box3().setFromObject(model.scene);
    if (bounds.isEmpty()) throw new Error('模型没有可见几何体');
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.01);
    const camera = new THREE.PerspectiveCamera(35, 480 / 300, radius / 100, radius * 100);
    camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1.3).normalize().multiplyScalar(radius / Math.sin(35 * Math.PI / 360) * 1.15));
    camera.lookAt(center);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x686050, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.copy(center).add(new THREE.Vector3(radius, radius * 2, radius * 3));
    light.target.position.copy(center);
    scene.add(light, light.target);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    const textures = new Set<import('three').Texture>();
    model.scene.traverse(object => {
      const mesh = object as import('three').Mesh;
      mesh.geometry?.dispose();
      for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
    });
    for (const texture of textures) {
      texture.dispose();
      if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
    }
    renderer.renderLists.dispose();
  }
}

export function ModelAssetPreview({ url, name }: { url: string; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setImage(''); setError(false);
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || !url) return;
      observer.disconnect();
      queue = queue.catch(() => undefined).then(async () => {
        if (cancelled) return;
        try { const result = await thumbnail(url); if (!cancelled) setImage(result); }
        catch { if (!cancelled) setError(true); }
      });
    }, { rootMargin: '200px' });
    if (host.current) observer.observe(host.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [url]);
  return <div className="asset-model-preview" ref={host} aria-label={`${name} 3D 模型`}>
    {image ? <img src={image} alt={`${name} 3D 模型预览`} /> : <span role="status">{error ? '模型预览失败' : '正在加载模型…'}</span>}
  </div>;
}
