import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import puppeteer, { type Browser } from 'puppeteer-core';
import { config, rootDir } from '../config.js';
import { HttpError } from '../http.js';

const regularFont = path.join(rootDir, 'server/assets/fonts/NotoSans-Regular.ttf');
const boldFont = path.join(rootDir, 'server/assets/fonts/NotoSans-Bold.ttf');

export function chromeReady(): boolean {
  return Boolean(config.chromePath) && fs.existsSync(config.chromePath);
}

export function renderPdf(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    if (fs.existsSync(regularFont) && fs.existsSync(boldFont)) {
      doc.registerFont('Body', regularFont);
      doc.registerFont('Strong', boldFont);
      doc.font('Body');
    }
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function withPdf(chromeHtml: () => Promise<string>, fallback: () => Promise<Buffer>): Promise<Buffer> {
  if (!chromeReady()) return fallback();
  try {
    return await htmlToPdf(await chromeHtml());
  } catch (error) {
    if (error instanceof HttpError && error.status === 503) return fallback();
    throw error;
  }
}

let browserPromise: Promise<Browser> | null = null;

async function browser(): Promise<Browser> {
  if (!config.chromePath) {
    throw new HttpError(503, 'The PDF could not be created.');
  }
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: config.chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
  try {
    const instance = await browser();
    page = await instance.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'The PDF could not be created.');
  } finally {
    await page?.close().catch((error: unknown) => {
      void error;
    });
  }
}
