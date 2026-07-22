#!/usr/bin/env node
/**
 * Legacy: Prebuild IMPA search index from PDF.js text layer.
 * Prefer scripts/generate-search-index.mjs (OCR Markdown) for production.
 *
 * Run: node scripts/generate-search-index-from-pdf.mjs
 * Output: public/search-index.json
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PDF_CONFIG_PATH = join(ROOT, 'src/config/pdf.ts');
const SPLIT_INFO_PATH = join(ROOT, 'public/pdfs/sections/accurate-split-info.json');
const OUTPUT_PATH = join(ROOT, 'public/search-index.json');
const STANDARD_FONT_DATA_URL = join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/');

const IMPA_CODE_RE = /\b(\d{6})\b/g;
const DESCRIPTION_LIMIT = 120;

function readSectionsFromPdfConfig() {
  const source = readFileSync(PDF_CONFIG_PATH, 'utf-8');
  const sectionsMatch = source.match(/sections:\s*\[([\s\S]*?)\]\s*,\s*\/\/ PDF文件信息/);

  if (!sectionsMatch) {
    throw new Error('Unable to find PDF_CONFIG.sections in src/config/pdf.ts');
  }

  const sectionBlocks = sectionsMatch[1].match(/\{\s*name:[\s\S]*?\n\s*\}/g) ?? [];

  return sectionBlocks.map((block) => {
    const section = {
      name: readStringProperty(block, 'name'),
      title: readStringProperty(block, 'title'),
      filePath: readStringProperty(block, 'filePath'),
      startPage: readNumberProperty(block, 'startPage'),
      endPage: readNumberProperty(block, 'endPage'),
    };

    if (!section.name || !section.filePath || !section.startPage || !section.endPage) {
      throw new Error(`Incomplete section config: ${block}`);
    }

    return section;
  });
}

function readStringProperty(block, propertyName) {
  return block.match(new RegExp(`${propertyName}:\\s*'([^']+)'`))?.[1] ?? '';
}

function readNumberProperty(block, propertyName) {
  const value = block.match(new RegExp(`${propertyName}:\\s*(\\d+)`))?.[1];
  return value ? Number(value) : 0;
}

function validateSections(sections) {
  if (!sections.length) {
    throw new Error('No sections found in src/config/pdf.ts');
  }

  if (!existsSync(SPLIT_INFO_PATH)) {
    console.warn('Warning: accurate-split-info.json not found; skipping split metadata validation.');
    return;
  }

  const splitInfo = JSON.parse(readFileSync(SPLIT_INFO_PATH, 'utf-8'));
  const splitSections = new Map(
    splitInfo.sections.map((section) => [
      section.name,
      {
        startPage: section.start_page,
        endPage: section.end_page,
        filePath: `/pdfs/${section.file_path}`,
      },
    ])
  );

  for (const section of sections) {
    const splitSection = splitSections.get(section.name);
    if (!splitSection) {
      throw new Error(`Section ${section.name} is missing from accurate-split-info.json`);
    }

    if (
      splitSection.startPage !== section.startPage ||
      splitSection.endPage !== section.endPage ||
      splitSection.filePath !== section.filePath
    ) {
      throw new Error(
        `Section ${section.name} differs from accurate-split-info.json: ` +
          `${section.startPage}-${section.endPage} ${section.filePath}`
      );
    }
  }
}

async function loadPdfJs() {
  try {
    const module = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return 'getDocument' in module ? module : module.default;
  } catch {
    const module = await import('pdfjs-dist/legacy/build/pdf.js');
    return 'getDocument' in module ? module : module.default;
  }
}

async function extractFromSection(pdfjsLib, section) {
  const pdfPath = join(ROOT, 'public', section.filePath);
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const entries = [];
  const seenOnPage = new Set();
  const allowedPrefixes = getAllowedCodePrefixes(section.name);

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const lines = getSortedLines(textContent.items);
    const absolutePage = section.startPage + pageNum - 1;

    for (const line of lines) {
      IMPA_CODE_RE.lastIndex = 0;
      let match;

      while ((match = IMPA_CODE_RE.exec(line)) !== null) {
        const code = match[1];
        const key = `${code}-${absolutePage}`;

        if (!allowedPrefixes.some((prefix) => code.startsWith(prefix))) {
          continue;
        }

        if (seenOnPage.has(key)) {
          continue;
        }

        seenOnPage.add(key);
        entries.push({
          code,
          name: normalizeDescription(line.slice(match.index + code.length)),
          page: absolutePage,
          relativePage: pageNum,
          sectionName: section.name,
          filePath: section.filePath,
        });
      }
    }
  }

  return entries;
}

function getAllowedCodePrefixes(sectionName) {
  if (sectionName.startsWith('00_10-')) {
    return ['00', '10'];
  }

  const prefix = sectionName.match(/^(\d{2})/)?.[1];
  if (!prefix) {
    throw new Error(`Unable to infer IMPA code prefix from section name: ${sectionName}`);
  }

  return [prefix];
}

function getSortedLines(items) {
  const lineMap = new Map();

  for (const item of items) {
    const text = item.str?.trim();
    if (!text) continue;

    const transform = item.transform ?? [];
    const x = Number(transform[4] ?? 0);
    const y = Math.round(Number(transform[5] ?? 0));

    if (!lineMap.has(y)) {
      lineMap.set(y, []);
    }

    lineMap.get(y).push({ x, text });
  }

  return Array.from(lineMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) =>
      lineItems
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
}

function normalizeDescription(value) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.startsWith('/')) {
    return '';
  }

  if (!isReadable(trimmed)) {
    return '';
  }

  return trimmed.slice(0, DESCRIPTION_LIMIT);
}

function isReadable(value) {
  if (!value || value.length < 2) {
    return false;
  }

  const printable = value.replace(/[^\x20-\x7E]/g, '');
  return printable.length / value.length > 0.7;
}

async function main() {
  console.log('Generating IMPA search index from PDF text layer (legacy)...');

  const sections = readSectionsFromPdfConfig();
  validateSections(sections);

  const pdfjsLib = await loadPdfJs();
  const allEntries = [];

  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    process.stdout.write(`  [${index + 1}/${sections.length}] ${section.name}...`);

    const entries = await extractFromSection(pdfjsLib, section);
    allEntries.push(...entries);
    console.log(` ${entries.length} codes found`);
  }

  const cleanEntries = allEntries.sort((a, b) => a.page - b.page || a.code.localeCompare(b.code));
  const searchIndex = {
    version: '1.0',
    generated: new Date().toISOString().slice(0, 10),
    source: 'pdf-text-layer',
    totalEntries: cleanEntries.length,
    entries: cleanEntries,
  };

  const output = JSON.stringify(searchIndex);
  writeFileSync(OUTPUT_PATH, output);

  const sizeMB = (Buffer.byteLength(output) / 1024 / 1024).toFixed(2);
  console.log(`\nDone. ${cleanEntries.length} entries -> public/search-index.json (${sizeMB} MB)`);
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
