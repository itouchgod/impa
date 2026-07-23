#!/usr/bin/env node
/**
 * 对「索引中该相对页无任何条目」的页面做 OCR 归类。
 *
 * 关键：OCR 里出现的章节匹配编码，是否已在**全库**索引中：
 *   - true_missing_codes          → 真待办（OCR 有码且全库没有）
 *   - codes_deduped_elsewhere     → 去重假象（码已在其他页入库，本页条目为 0）
 *   - wrong_chapter_noise         → 仅抽到其他章节前缀噪声
 *   - ocr_table_corrupted_possible_miss → 空表/乱表，易漏抽
 *   - table_present_but_no_codes / likely_reference_or_sign / …
 *       → 多半是正常参考页
 *
 *   OCR_SECTIONS_DIR=... npm run audit:nocode
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

function chapterPrefixes(secName) {
  // 00_10 章节允许 00 与 10
  if (secName.startsWith('00_10')) return ['00', '10'];
  return [secName.slice(0, 2)];
}

function ocrPageFor(sections, sec, rel) {
  const logicalName = logical(sec.name);
  const first = sections.find(
    (s) => s.name === logicalName || s.name === `${logicalName}_part1`
  );
  const abs = sec.start + rel - 1;
  return first ? abs - first.start + 1 : rel;
}

/** 从 OCR 抽出 6 位编码候选：空格 / 点号 / 紧凑 */
function extractCodes(text) {
  const spaced = [...text.matchAll(/\b(\d{2})\s+(\d{2})\s+(\d{2})\b/g)].map(
    (m) => `${m[1]}${m[2]}${m[3]}`
  );
  const dotted = [...text.matchAll(/\b(\d{2})\.(\d{4})\d?\b/g)].map(
    (m) => `${m[1]}${m[2]}`
  );
  const compact = [...text.matchAll(/\b(\d{6})\b/g)].map((m) => m[1]);
  return [...new Set([...spaced, ...dotted, ...compact])];
}

function pageSignals(text) {
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
  return {
    chars: plain.length,
    tables,
    images,
    titles,
    captions,
    tds,
    nonemptyCells,
    plain,
  };
}

function classify(text, prefixes, indexCodes) {
  const allCodes = extractCodes(text);
  const chapterCodes = allCodes.filter((c) => prefixes.includes(c.slice(0, 2)));
  const otherCodes = allCodes.filter((c) => !prefixes.includes(c.slice(0, 2)));
  const missing = chapterCodes.filter((c) => !indexCodes.has(c));
  const alreadyInIndex = chapterCodes.filter((c) => indexCodes.has(c));
  const sig = pageSignals(text);
  const codeHits = allCodes.length;

  let guess;
  if (missing.length > 0) {
    // 真待办：本页 OCR 有章节码，且全库没有
    guess = 'true_missing_codes';
  } else if (alreadyInIndex.length > 0) {
    // 去重假象：码已在其他页，本相对页条目为 0
    guess = 'codes_deduped_elsewhere';
  } else if (otherCodes.length >= 2 && chapterCodes.length === 0) {
    guess = 'wrong_chapter_noise';
  } else if (sig.chars < 400 && codeHits < 2) {
    guess = 'ocr_tiny_fail';
  } else if (
    sig.tables > 0 &&
    codeHits === 0 &&
    sig.tds > 50 &&
    sig.nonemptyCells <= 5
  ) {
    guess = 'ocr_table_corrupted_possible_miss';
  } else if (sig.tables > 0 && codeHits === 0) {
    guess = 'table_present_but_no_codes';
  } else if (sig.images >= 2 && codeHits < 2 && sig.chars < 2000) {
    guess = 'image_heavy_maybe_codes_in_images';
  } else if (sig.images >= 3 && codeHits < 3) {
    guess = 'image_heavy_maybe_codes_in_images';
  } else if (
    /unit|conversion|thread|voltage|brand|standard|how to measure|nomenclature|classification/i.test(
      sig.plain
    ) &&
    codeHits < 2
  ) {
    guess = 'likely_reference_or_sign';
  } else {
    guess = 'text_no_codes';
  }

  return {
    chars: sig.chars,
    tables: sig.tables,
    images: sig.images,
    titles: sig.titles,
    captions: sig.captions,
    tds: sig.tds,
    nonemptyCells: sig.nonemptyCells,
    chapterCodes: chapterCodes.length,
    otherCodes: otherCodes.length,
    alreadyInIndex: alreadyInIndex.length,
    missingFromIndex: missing.length,
    missingSamples: missing.slice(0, 12),
    otherSamples: otherCodes.slice(0, 8),
    guess,
  };
}

function main() {
  const index = JSON.parse(
    readFileSync(join(ROOT, 'public/search-index.json'), 'utf-8')
  );
  const indexCodes = new Set(index.entries.map((e) => e.code));
  const sections = readSections();
  const bySec = new Map();
  for (const e of index.entries) {
    if (!bySec.has(e.sectionName)) bySec.set(e.sectionName, new Set());
    bySec.get(e.sectionName).add(e.relativePage);
  }

  const out = [];
  for (const sec of sections) {
    const indexed = bySec.get(sec.name) || new Set();
    const prefixes = chapterPrefixes(sec.name);
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
        ...classify(text, prefixes, indexCodes),
        path,
      });
    }
  }

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));

  const by = {};
  for (const p of out) by[p.guess] = (by[p.guess] || 0) + 1;
  const trueMissing = out.filter((p) => p.guess === 'true_missing_codes');
  const summary = {
    indexVersion: index.version,
    totalEmptyRelativePages: out.length,
    byGuess: by,
    trueMissingCount: trueMissing.length,
    trueMissing: trueMissing.map((p) => ({
      sec: p.sec,
      rel: p.rel,
      missingFromIndex: p.missingFromIndex,
      missingSamples: p.missingSamples,
    })),
  };
  writeFileSync(
    join(ROOT, 'reports/no-code-pages-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Wrote ${join(ROOT, 'reports/no-code-pages-summary.json')}`);
}

main();
