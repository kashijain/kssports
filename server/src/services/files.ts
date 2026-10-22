import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { rootDir, uploadsDir } from '../config.js';
import { HttpError } from '../http.js';

const brandLogoFile = path.join(rootDir, 'server/assets/ks-logo.png');
let brandLogoCache = '';

export async function brandLogoDataUrl(): Promise<string> {
  if (brandLogoCache) return brandLogoCache;
  const buf = await fs.promises.readFile(brandLogoFile);
  brandLogoCache = `data:image/png;base64,${buf.toString('base64')}`;
  return brandLogoCache;
}

export async function readDataUrl(relativePath: string): Promise<string> {
  if (!relativePath || relativePath.includes('..')) return '';
  const abs = path.join(uploadsDir, relativePath);
  try {
    const buf = await fs.promises.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

export async function removeUpload(relativePath: string): Promise<void> {
  if (!relativePath || relativePath.includes('..')) return;
  await fs.promises.rm(path.join(uploadsDir, relativePath), { force: true });
}

export const documentUpload = multer({
  storage: multer.diskStorage({
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
  }),
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
  storage: multer.diskStorage({
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
  }),
  limits: { fileSize: 1.5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(new HttpError(400, 'Upload a PNG, JPG, or WebP image.'));
      return;
    }
    cb(null, true);
  },
});
