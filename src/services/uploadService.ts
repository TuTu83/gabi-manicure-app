import Taro from '@tarojs/taro';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage, isFirebaseConfigured } from '@/services/firebase';
import { consumeRateLimit } from '@/services/storage';

type UploadTarget = 'services' | 'promotions' | 'branding';

const maxPreBytes = 15 * 1024 * 1024;
const maxUploadBytes = 8 * 1024 * 1024;

function getFileExt(filePath: string): string {
  const clean = (filePath || '').split('?')[0] || '';
  const idx = clean.lastIndexOf('.');
  if (idx < 0) return '';
  return clean.slice(idx + 1).toLowerCase();
}

async function readAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  if (process.env.TARO_ENV === 'h5') {
    const res = await fetch(filePath);
    const blob = await res.blob();
    if (blob.size > maxUploadBytes) throw new Error('Imagem muito grande. Envie uma imagem menor.');
    if (blob.type && !blob.type.startsWith('image/')) throw new Error('Arquivo inválido. Selecione uma imagem.');
    return await blob.arrayBuffer();
  }

  const fs = Taro.getFileSystemManager();
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    fs.readFile({
      filePath,
      success: (r: any) => resolve(r.data as ArrayBuffer),
      fail: (e: any) => reject(e),
    });
  });
}

async function compressIfPossible(filePath: string): Promise<string> {
  try {
    if (process.env.TARO_ENV !== 'weapp' && process.env.TARO_ENV !== 'tt' && process.env.TARO_ENV !== 'alipay') return filePath;
    const result = await Taro.compressImage({ src: filePath, quality: 70 });
    return (result as any).tempFilePath || filePath;
  } catch {
    return filePath;
  }
}

async function compressH5Image(filePath: string): Promise<Blob | null> {
  try {
    const res = await fetch(filePath);
    const blob = await res.blob();
    if (blob.size > maxPreBytes) throw new Error('Imagem muito grande. Envie uma imagem menor.');
    if (blob.type && !blob.type.startsWith('image/')) throw new Error('Arquivo inválido. Selecione uma imagem.');
    const url = URL.createObjectURL(blob);

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    const maxWidth = 1280;
    const ratio = image.width > maxWidth ? maxWidth / image.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
    URL.revokeObjectURL(url);
    if (out && out.size > maxUploadBytes) throw new Error('Imagem muito grande. Envie uma imagem menor.');
    return out;
  } catch {
    return null;
  }
}

export async function uploadImageFromPath(params: { filePath: string; target: UploadTarget; fileNamePrefix: string }): Promise<string> {
  const filePath = params.filePath;
  if (!filePath) throw new Error('Arquivo inválido');

  const rl = consumeRateLimit({ key: `uploadImage:${params.target}`, max: 4, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitos uploads seguidos. Aguarde alguns segundos e tente novamente.');

  const ext = getFileExt(filePath);
  const allowed = ['jpg', 'jpeg', 'png', 'webp'];
  if (ext && !allowed.includes(ext)) throw new Error('Formato inválido. Use JPG, PNG ou WEBP.');

  if (!isFirebaseConfigured()) return filePath;
  const storage = getFirebaseStorage();
  if (!storage) return filePath;

  let uploadBytesData: ArrayBuffer | Blob;
  let contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  if (process.env.TARO_ENV === 'h5') {
    const compressed = await compressH5Image(filePath);
    if (compressed) {
      uploadBytesData = compressed;
      contentType = 'image/jpeg';
    } else {
      uploadBytesData = await readAsArrayBuffer(filePath);
    }
  } else {
    try {
      const info = await Taro.getFileInfo({ filePath });
      const size = (info as any).size as number | undefined;
      if (size && size > maxPreBytes) throw new Error('Imagem muito grande. Envie uma imagem menor.');
    } catch (error) {
      console.error('[Upload] falha ao validar tamanho do arquivo', error);
    }
    const compressedPath = await compressIfPossible(filePath);
    uploadBytesData = await readAsArrayBuffer(compressedPath);
    if ((uploadBytesData as ArrayBuffer).byteLength > maxUploadBytes) throw new Error('Imagem muito grande. Envie uma imagem menor.');
  }

  const now = Date.now();
  const safePrefix = (params.fileNamePrefix || 'img').replace(/[^\w\-]+/g, '_');
  const fileName = `${safePrefix}_${now}.jpg`;
  const path = `${params.target}/${fileName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, uploadBytesData as any, { contentType, cacheControl: 'public,max-age=31536000' } as any);
  return await getDownloadURL(storageRef);
}
