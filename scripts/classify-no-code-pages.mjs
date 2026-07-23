#!/usr/bin/env node
/**
 * 对「索引中无任何条目」的相对页做 OCR 归类。
 *
 * 重点：区分「真·参考页无编码」与「OCR 空表/损坏导致漏抽」。
 *
 *   OCR_SECTIONS_DIR=... node scripts/classify-no-code-pages.mjs
 *   → reports/no-code-pages.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OCR = process.env.OCR_SECTIONS_DIR || '/Users/roger/website/impa-pdf/outputs/sections';
const OUT = join(ROOT, 'reports/no-code-pages.json');

function readSections() {
  const src = readFileSync(join(ROOT, 'src/config/pdf.ts'), 'utf-8');
  const sections = [];
  const re =
    /name:\s*'([^']+)'[\s\S]*?startPage:\s*(\d+)[\s\S]*?endPage:\s*(\d+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    sections.push({
      name: m[1],
      start: Number(m[2]),
      end: Number(m[3]),
      pages: Number(m[3]) - Number(m[2]) + 1,
    });
  }
  return sections;
}

function logical(name) {
  return name.replace(/_part[12]$/, '');
}

function ocrPageFor(sections, sec, rel) {
  const logicalName = logical(sec.name);
  const first = sections.find(
    (s) => s.name === logicalName || s.name === `${logicalName}_part1`
  );
  const abs = sec.start + rel - 1;
  return first ? abs - first.start + 1 : rel;
}

function classify(text, chapterPrefix) {
  const spaced = (text.match(/\b\d{2}\s+\d{2}\s+\d{2}\b/g) || []).length;
  const dotted = (text.match(/\b\d{2}\.\d{4}\d?\b/g) || []).length;
  const compact = (
    text.match(new RegExp(`\\b${chapterPrefix}\\d{4}\\b`, 'g')) || []
  ).length;
  const codeHits = spaced + dotted + compact;
  const tds = (text.match(/<td\b/gi) || []).length;
  const cells = [...text.matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((x) =>
    x[1].replace(/<[^>]+>/g, '').trim()
  );
  const nonemptyCells = cells.filter((c) => c && c !== '&nbsp;').length;
  const images = (text.match(/<\|det\|>image\b/g) || []).length;
  const tables = (text.match(/<\|det\|>table\b/g) || []).length;
  const titles = [...text.matchAll(/<\|det\|>title\b[^<]*<\/\|det\|>(.*)/g)]
    .map((x) => x[1].trim())
    .filter(Boolean)
    .slice(0, 3);
  const captions = [
    ...text.matchAll(/<\|det\|>image_caption\b[^<]*<\/\|det\|>(.*)/g),
  ]
    .map((x) => x[1].trim())
    .filter(Boolean)
    .slice(0, 3);
  const plain = text
    .replace(/<\|det\|>[^<]*<\/\|det\|>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = plain.length;

  // 空表/乱表：大量 <td> 但几乎无内容、也抽不出编码 → 易被误判成「参考页」
  let guess = 'text_no_codes';
  if (chars < 400 && codeHits < 2) guess = 'ocr_tiny_fail';
  else if (tables > 0 && codeHits === 0 && tds > 50 && nonemptyCells <= 5)
    guess = 'ocr_table_corrupted_possible_miss';
  else if (tables > 0 && codeHits === 0) guess = 'table_present_but_no_codes';
  else if (images >= 2 && codeHits < 2 && chars < 2000)
    guess = 'image_heavy_maybe_codes_in_images';
  else if (images >= 3 && codeHits < 3) guess = 'image_heavy_maybe_codes_in_images';
  else if (
    /unit|conversion|thread|voltage|brand|standard|how to measure|nomenclature|classification/i.test(
      plain
    ) &&
    codeHits < 2
  )
    guess = 'likely_reference_or_sign';
  else if (codeHits >= 2) guess = 'has_codes_but_not_indexed';
  else guess = 'text_no_codes';

  return {
    chars,
    tables,
    images,
    titles,
    captions,
    spaced,
    dotted,
    compact,
    tds,
    nonemptyCells,
    guess,
  };
}

function main() {
  const index = JSON.parse(readFileSync(join(ROOT, 'public/search-index.json'), 'utf-8'));
  const sections = readSections();
  const bySec = new Map();
  for (const e of index.entries) {
    if (!bySec.has(e.sectionName)) bySec.set(e.sectionName, new Set());
    bySec.get(e.sectionName).add(e.relativePage);
  }

  const out = [];
  for (const sec of sections) {
    const indexed = bySec.get(sec.name) || new Set();
    const prefix = sec.name.slice(0, 2);
    for (let rel = 1; rel <= sec.pages; rel++) {
      if (indexed.has(rel)) continue;
      if (rel <= 1) continue;
      const ocrPage = ocrPageFor(sections, sec, rel);
      const path = join(
        OCR,
        logical(sec.name),
        'pages',
        `page_${String(ocrPage).padStart(4, '0')}.md`
      );
      if (!existsSync(path)) {
        out.push({
          sec: sec.name,
          rel,
          ocrPage,
          guess: 'missing_ocr_file',
          path,
        });
        continue;
      }
      const text = readFileSync(path, 'utf-8');
      out.push({
        sec: sec.name,
        rel,
        ocrPage,
        ...classify(text, prefix),
        path,
      });
    }
  }

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  const by = {};
  for (const p of out) by[p.guess] = (by[p.guess] || 0) + 1;
  console.log(JSON.stringify({ total: out.length, byGuess: by }, null, 2));
  console.log(`Wrote ${OUT}`);
}

main();
