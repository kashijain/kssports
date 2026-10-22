import fs from 'node:fs';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import multer, { type StorageEngine } from 'multer';
import { cloudinarySettings, rootDir, uploadsDir } from '../config.js';
import { HttpError } from '../http.js';

const brandLogoFile = path.join(rootDir, 'server/assets/ks-logo.png');
let brandLogoCache = '';
const IMAGE_PREFIX = 'cld:';
const RAW_PREFIX = 'cldraw:';

export function cloudinaryEnabled(): boolean {
  return cloudinarySettings().enabled;
}

function configureCloudinary(): void {
  const settings = cloudinarySettings();
  cloudinary.config({
    cloud_name: settings.cloudName,
    api_key: settings.apiKey,
    api_secret: settings.apiSecret,
    secure: true,
  });
}

function uploadBuffer(buffer: Buffer, options: Record<string, unknown>): Promise<{ public_id: string }> {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result?.public_id) {
        reject(new HttpError(502, 'Could not store the file.'));
        return;
      }
      resolve({ public_id: result.public_id });
    });
    stream.end(buffer);
  });
}

export function publicAssetUrl(stored: string): string {
  if (!stored) return '';
  if (stored.startsWith(RAW_PREFIX)) return '';
  if (stored.startsWith(IMAGE_PREFIX)) {
    if (!cloudinaryEnabled()) return '';
    configureCloudinary();
    return cloudinary.url(stored.slice(IMAGE_PREFIX.length), {
      secure: true,
      resource_type: 'image',
      type: 'upload',
    });
  }
  if (stored.startsWith('https://') || stored.startsWith('http://')) return stored;
  return `/uploads/${stored}`;
}

export async function brandLogoDataUrl(): Promise<string> {
  if (brandLogoCache) return brandLogoCache;
  const buf = await fs.promises.readFile(brandLogoFile);
  brandLogoCache = `data:image/png;base64,${buf.toString('base64')}`;
  return brandLogoCache;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new HttpError(404, 'File is missing.');
  return Buffer.from(await response.arrayBuffer());
}

function signedRawUrl(publicId: string): string {
  configureCloudinary();
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + 120,
  });
}

export async function readStoredBytes(stored: string): Promise<Buffer> {
  if (!stored || stored.includes('..')) throw new HttpError(404, 'File is missing.');
  if (stored.startsWith(RAW_PREFIX)) {
    return fetchBytes(signedRawUrl(stored.slice(RAW_PREFIX.length)));
  }
  if (stored.startsWith(IMAGE_PREFIX)) {
    const url = publicAssetUrl(stored);
    if (!url) throw new HttpError(404, 'File is missing.');
    return fetchBytes(url);
  }
  const abs = path.join(uploadsDir, stored);
  if (!abs.startsWith(uploadsDir) || !fs.existsSync(abs)) throw new HttpError(404, 'File is missing.');
  return fs.promises.readFile(abs);
}

function imageMime(buf: Buffer, stored: string): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const ext = path.extname(stored).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function readDataUrl(relativePath: string): Promise<string> {
  if (!relativePath || relativePath.includes('..')) return '';
  try {
    const buf = await readStoredBytes(relativePath);
    return `data:${imageMime(buf, relativePath)};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function destroyCloudinary(publicId: string, resourceType: 'image' | 'raw', deliveryType: 'upload' | 'authenticated'): Promise<void> {
  if (!cloudinaryEnabled()) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: deliveryType, invalidate: true });
}

export async function removeUpload(relativePath: string): Promise<void> {
  if (!relativePath || relativePath.includes('..')) return;
  if (relativePath.startsWith(RAW_PREFIX)) {
    await destroyCloudinary(relativePath.slice(RAW_PREFIX.length), 'raw', 'authenticated');
    return;
  }
  if (relativePath.startsWith(IMAGE_PREFIX)) {
    await destroyCloudinary(relativePath.slice(IMAGE_PREFIX.length), 'image', 'upload');
    return;
  }
  await fs.promises.rm(path.join(uploadsDir, relativePath), { force: true });
}

export async function storedPublicImage(file: Express.Multer.File, businessId: string, kind: 'products' | 'brand' | 'machines'): Promise<string> {
  if (!cloudinaryEnabled()) return path.posix.join(businessId, path.basename(file.filename));
  if (!file.buffer?.length) throw new HttpError(400, 'Choose an image.');
  const uploaded = await uploadBuffer(file.buffer, {
    folder: `kssports/${businessId}/${kind}`,
    resource_type: 'image',
    type: 'upload',
    unique_filename: true,
    overwrite: false,
  });
  return `${IMAGE_PREFIX}${uploaded.public_id}`;
}

export async function storedPrivateFile(file: Express.Multer.File, businessId: string): Promise<string> {
  if (!cloudinaryEnabled()) return path.posix.join(businessId, 'private', path.basename(file.filename));
  if (!file.buffer?.length) throw new HttpError(400, 'Choose a file and the record it belongs to.');
  const uploaded = await uploadBuffer(file.buffer, {
    folder: `kssports/${businessId}/documents`,
    resource_type: 'raw',
    type: 'authenticated',
    unique_filename: true,
    overwrite: false,
  });
  return `${RAW_PREFIX}${uploaded.public_id}`;
}

export async function discardRejectedUpload(file: Express.Multer.File, businessId: string): Promise<void> {
  if (cloudinaryEnabled()) return;
  await removeUpload(path.posix.join(businessId, 'private', path.basename(file.filename || '')));
}

function diskImageStorage(): StorageEngine {
  return multer.diskStorage({
    destination(req, _file, cb) {
      const businessId = req.auth?.businessId;
      if (!businessId) {
        cb(new HttpError(409, 'Add your business profile to continue.'), '');
        return;
      }
      const dir = path.join(uploadsDir, businessId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
      cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    },
  });
}

function diskDocumentStorage(): StorageEngine {
  return multer.diskStorage({
    destination(req, _file, cb) {
      const businessId = req.auth?.businessId;
      if (!businessId) {
        cb(new HttpError(409, 'Add your business profile to continue.'), '');
        return;
      }
      const dir = path.join(uploadsDir, businessId, 'private');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2, 10)}${ext}`);
    },
  });
}

function hybridStorage(disk: StorageEngine): StorageEngine {
  return {
    _handleFile(req, file, cb) {
      if (!cloudinaryEnabled()) {
        disk._handleFile(req, file, cb);
        return;
      }
      const chunks: Buffer[] = [];
      file.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.stream.on('error', (error) => cb(error));
      file.stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        cb(null, { buffer, size: buffer.length, filename: file.originalname });
      });
    },
    _removeFile(req, file, cb) {
      if (cloudinaryEnabled()) {
        cb(null);
        return;
      }
      disk._removeFile(req, file, cb);
    },
  };
}

export const documentUpload = multer({
  storage: hybridStorage(diskDocumentStorage()),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype);
    if (!ok) {
      cb(new HttpError(400, 'Upload a PDF, JPG, or PNG.'));
      return;
    }
    cb(null, true);
  },
});

export const upload = multer({
  storage: hybridStorage(diskImageStorage()),
  limits: { fileSize: 1.5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(new HttpError(400, 'Upload a PNG, JPG, or WebP image.'));
      return;
    }
    cb(null, true);
  },
});
