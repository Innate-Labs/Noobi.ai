import { BrowserWindow, nativeImage } from 'electron';
import type { DecodedReference } from './visualReferenceStore.js';

/** Called only after the store has checked encoded size and dimensions. */
export async function decodeVisualReference(bytes: Buffer): Promise<DecodedReference> {
  let source = nativeImage.createFromBuffer(bytes);
  // nativeImage on macOS does not support WebP. Decode pixels in a sandboxed,
  // networkless Chromium page, then feed its PNG into the same normalizer.
  if (source.isEmpty() && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, partition: 'visual-reference-decoder' } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const decode = async () => {
        await window.loadURL(`data:text/html,${encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'none\'">')}`);
        return await window.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(`data:image/webp;base64,${bytes.toString('base64')}`)};await image.decode();if(image.naturalWidth>8192||image.naturalHeight>8192||image.naturalWidth*image.naturalHeight>16777216)throw Error('图片尺寸超限');const canvas=document.createElement('canvas');const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png')})()`);
      };
      const png = await Promise.race([decode(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('图片解码超时，请重新上传')), 10000); })]);
      if (typeof png !== 'string' || !png.startsWith('data:image/png;base64,')) throw new Error('图片无法解码');
      source = nativeImage.createFromDataURL(png);
    } finally { if (timer) clearTimeout(timer); if (!window.isDestroyed()) window.destroy(); }
  }
  if (source.isEmpty()) throw new Error('图片无法解码，请重新上传');
  const size = source.getSize();
  const resize = (limit: number) => Math.max(size.width, size.height) <= limit ? source : source.resize(size.width >= size.height ? { width: limit } : { height: limit });
  return { png: resize(2048).toPNG(), thumbnail: resize(320).toPNG() };
}
