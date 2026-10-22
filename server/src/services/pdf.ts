import puppeteer, { type Browser } from 'puppeteer-core';
import { config } from '../config.js';
import { HttpError } from '../http.js';

let browserPromise: Promise<Browser> | null = null;

async function browser(): Promise<Browser> {
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
    throw new HttpError(503, 'The PDF engine is unavailable. You can still print the invoice from the preview.');
  } finally {
    await page?.close().catch((error: unknown) => {
      void error;
    });
  }
}
