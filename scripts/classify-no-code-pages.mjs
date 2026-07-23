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

/** 从站点 PDF 文本层抽编码（用于揭穿「OCR 无码」假阴性） */
async function pdfPageChapterCodes(pdfAbs, relativePage, prefixes) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
    const data = new Uint8Array(readFileSync(pdfAbs));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    if (relativePage < 1 || relativePage > doc.numPages) {
      doc.destroy?.();
      return [];
    }
    const page = await doc.getPage(relativePage);
    const tc = await page.getTextContent();
    const raw = tc.items.map((i) => i.str).join(' ');
    doc.destroy?.();
    const codes = extractCodes(raw).filter((c) => prefixes.includes(c.slice(0, 2)));
    return [...new Set(codes)];
  } catch {
    return [];
  }
}

const SUSPECT_GUESSES = new Set([
  'table_present_but_no_codes',
  'ocr_table_corrupted_possible_miss',
  'ocr_tiny_fail',
  'text_no_codes',
  'likely_reference_or_sign',
  'image_heavy_maybe_codes_in_images',
]);

async function main() {
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

  // PDF 交叉核对：OCR 看似无码时，若 PDF 文本层有章节码 → 提取失败（勿当参考页免检）
  for (const row of out) {
    if (!SUSPECT_GUESSES.has(row.guess)) continue;
    const sec = sections.find((s) => s.name === row.sec);
    if (!sec) continue;
    const pdfAbs = join(
      ROOT,
      'public',
      'pdfs',
      'sections',
      `${row.sec}.pdf`.replace(/_part[12]\.pdf$/, (m) => {
        // file name matches section name
        return m;
      })
    );
    // resolve filePath from config more carefully
    const cfg = readFileSync(join(ROOT, 'src/config/pdf.ts'), 'utf-8');
    const m = cfg.match(
      new RegExp(
        `name:\\s*'${row.sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?filePath:\\s*'([^']+)'`
      )
    );
    const pdfPath = m
      ? join(ROOT, 'public', m[1].replace(/^\//, ''))
      : pdfAbs;
    if (!existsSync(pdfPath)) continue;
    const prefixes = chapterPrefixes(row.sec);
    const pdfCodes = await pdfPageChapterCodes(pdfPath, row.rel, prefixes);
    row.pdfChapterCodes = pdfCodes.length;
    row.pdfSamples = pdfCodes.slice(0, 8);
    if (pdfCodes.length >= 3) {
      const missing = pdfCodes.filter((c) => !indexCodes.has(c));
      row.pdfMissingFromIndex = missing.length;
      row.pdfMissingSamples = missing.slice(0, 12);
      row.guess =
        missing.length > 0
          ? 'pdf_has_codes_ocr_extract_failed'
          : 'codes_deduped_elsewhere';
      row.note =
        'PDF text layer contains chapter codes but OCR markdown did not yield index entries for this page — do not treat as reference blank.';
    }
  }

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));

  const by = {};
  for (const p of out) by[p.guess] = (by[p.guess] || 0) + 1;
  const trueMissing = out.filter((p) => p.guess === 'true_missing_codes');
  const pdfFailed = out.filter(
    (p) => p.guess === 'pdf_has_codes_ocr_extract_failed'
  );
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
    pdfExtractFailedCount: pdfFailed.length,
    pdfExtractFailed: pdfFailed.map((p) => ({
      sec: p.sec,
      rel: p.rel,
      pdfChapterCodes: p.pdfChapterCodes,
      pdfMissingFromIndex: p.pdfMissingFromIndex,
      pdfMissingSamples: p.pdfMissingSamples,
    })),
    note: [
      'true_missing_codes = OCR 明文有章节码且全库没有。',
      'pdf_has_codes_ocr_extract_failed = PDF 文本层有码但 OCR/索引本页为空（如曾漏的 69 页11/13）；勿当参考页免检。',
      '页8 类自定义字体乱码时 PDF 交叉也可能失效，需渲染图/Vision 人工核。',
      'codes_deduped_elsewhere = 去重假象，非漏修。',
    ],
  };
  writeFileSync(
    join(ROOT, 'reports/no-code-pages-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Wrote ${join(ROOT, 'reports/no-code-pages-summary.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
