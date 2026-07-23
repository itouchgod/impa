#!/usr/bin/env node
/**
 * 审计：PDF 总页数 vs 索引相对页覆盖 + OCR 质量信号
 *
 * 用法:
 *   node scripts/audit-index-coverage.mjs
 *   OCR_SECTIONS_DIR=... node scripts/audit-index-coverage.mjs
 *
 * 输出: reports/index-coverage-audit.json + .md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INDEX_PATH = join(ROOT, 'public/search-index.json');
const PDF_DIR = join(ROOT, 'public/pdfs/sections');
const PDF_CONFIG_PATH = join(ROOT, 'src/config/pdf.ts');
const OCR_DIR = process.env.OCR_SECTIONS_DIR || '/Users/roger/website/impa-pdf/outputs/sections';
const OUT_DIR = join(ROOT, 'reports');

function readSections() {
  const src = readFileSync(PDF_CONFIG_PATH, 'utf-8');
  const sections = [];
  const re =
    /name:\s*'([^']+)'[\s\S]*?filePath:\s*'([^']+)'[\s\S]*?startPage:\s*(\d+)[\s\S]*?endPage:\s*(\d+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    sections.push({
      name: m[1],
      filePath: m[2],
      startPage: Number(m[3]),
      endPage: Number(m[4]),
      expectedPages: Number(m[4]) - Number(m[3]) + 1,
    });
  }
  return sections;
}

function pdfPageCount(absPath) {
  try {
    const { PDFDocument } = require('pdf-lib');
  } catch {
    // fall through
  }
  // Prefer pdfjs legacy already in project
  try {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const data = new Uint8Array(readFileSync(absPath));
    // sync wrapper via deasync unavailable — use child approach with pymupdf if needed
  } catch {
    // ignore
  }
  return null;
}

async function pdfPageCountAsync(absPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  const data = new Uint8Array(readFileSync(absPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const n = doc.numPages;
  doc.destroy?.();
  return n;
}

function contiguousRuns(pages) {
  if (!pages.length) return [];
  const runs = [];
  let start = pages[0];
  let prev = pages[0];
  for (const p of pages.slice(1)) {
    if (p === prev + 1) {
      prev = p;
    } else {
      runs.push([start, prev]);
      start = prev = p;
    }
  }
  runs.push([start, prev]);
  return runs;
}

function ocrSignals(logicalName, ocrRelPage) {
  const path = join(OCR_DIR, logicalName, 'pages', `page_${String(ocrRelPage).padStart(4, '0')}.md`);
  if (!existsSync(path)) return { missingFile: true };
  const text = readFileSync(path, 'utf-8');
  const spaced = (text.match(/\b\d{2}\s+\d{2}\s+\d{2}\b/g) || []).length;
  const dotted = (text.match(/\b\d{2}\.\d{4}\d?\b/g) || []).length;
  const ditto = (text.match(/&quot;|"/g) || []).length;
  return {
    missingFile: false,
    chars: text.length,
    spacedCodes: spaced,
    dottedCodes: dotted,
    dittoish: ditto,
    likelyDittoLoop: ditto > 300,
    likelyEmptyExtract: text.length < 800 && spaced + dotted < 2,
  };
}

function logicalNameFromSite(name) {
  return name.replace(/_part[12]$/, '');
}

async function main() {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  const sections = readSections();
  const bySection = new Map();
  for (const e of index.entries) {
    if (!bySection.has(e.sectionName)) bySection.set(e.sectionName, new Map());
    const m = bySection.get(e.sectionName);
    m.set(e.relativePage, (m.get(e.relativePage) || 0) + 1);
  }

  const multiPageGaps = [];
  const thinPages = [];
  const coverOk = [];

  for (const sec of sections) {
    const pdfAbs = join(ROOT, 'public', sec.filePath.replace(/^\//, ''));
    let total = sec.expectedPages;
    try {
      if (existsSync(pdfAbs)) {
        total = await pdfPageCountAsync(pdfAbs);
      }
    } catch {
      // keep config expected
    }

    const counts = bySection.get(sec.name) || new Map();
    const missing = [];
    for (let p = 1; p <= total; p++) {
      if (!counts.get(p)) missing.push(p);
    }

    const runs = contiguousRuns(missing);
    for (const [a, b] of runs) {
      const len = b - a + 1;
      if (a === 1 && b <= 2) {
        coverOk.push({ section: sec.name, pages: `${a}-${b}` });
        continue;
      }
      if (len >= 2) {
        multiPageGaps.push({
          section: sec.name,
          relativeFrom: a,
          relativeTo: b,
          pagesMissing: len,
          pdfTotal: total,
          indexedPages: [...counts.keys()].length,
        });
      }
    }

    // thin pages: count << median of pages that have entries
    const vals = [...counts.values()].sort((x, y) => x - y);
    if (vals.length < 5) continue;
    const median = vals[Math.floor(vals.length / 2)];
    if (median < 8) continue;
    for (const [page, n] of counts) {
      if (page <= 2) continue;
      if (n > 0 && n <= Math.max(2, Math.floor(median * 0.15))) {
        thinPages.push({
          section: sec.name,
          relativePage: page,
          entries: n,
          medianAround: median,
          ratio: Number((n / median).toFixed(3)),
        });
      }
    }
  }

  multiPageGaps.sort((a, b) => b.pagesMissing - a.pagesMissing);
  thinPages.sort((a, b) => a.ratio - b.ratio);

  // OCR quality on multi-page gaps
  for (const gap of multiPageGaps) {
    const logical = logicalNameFromSite(gap.section);
    const site = sections.find((s) => s.name === gap.section);
    const samples = [];
    for (let p = gap.relativeFrom; p <= Math.min(gap.relativeTo, gap.relativeFrom + 2); p++) {
      const ocrRel = site ? site.startPage - sections.find((s) => s.name.startsWith(logical) && !s.name.includes('part2') || s.name === logical)?.startPage + p : p;
      // OCR page = absolute - logicalStart + 1; logical start = first part's startPage
      const logicalStart = sections.find((s) => s.name === logical || s.name === `${logical}_part1`)?.startPage;
      const abs = site.startPage + p - 1;
      const ocrPage = logicalStart ? abs - logicalStart + 1 : p;
      samples.push({ relativePage: p, ocrPage, ...ocrSignals(logical, ocrPage) });
    }
    gap.ocrSamples = samples;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    generated: new Date().toISOString(),
    indexVersion: index.version,
    totalEntries: index.totalEntries,
    summary: {
      multiPageGapRuns: multiPageGaps.length,
      multiPageGapsTotalPages: multiPageGaps.reduce((s, g) => s + g.pagesMissing, 0),
      thinPages: thinPages.length,
      coverPagesSkipped: coverOk.length,
    },
    multiPageGaps,
    thinPages: thinPages.slice(0, 200),
    note: [
      '第1–2页缺失多为封面/目录，已排除出 multiPageGaps。',
      '33-Safety 标志页曾因 33.4210 点号格式未解析而整段空白；索引脚本 1.3 起已支持。',
      'thinPages：该页条目数远低于分册中位数（≤15%），类似 170841 所在页。',
    ],
  };

  writeFileSync(join(OUT_DIR, 'index-coverage-audit.json'), JSON.stringify(payload, null, 2));

  const md = [];
  md.push('# 搜索索引覆盖审计');
  md.push('');
  md.push(`生成时间: ${payload.generated}`);
  md.push(`索引版本: ${payload.indexVersion}（${payload.totalEntries} 条）`);
  md.push('');
  md.push('## 连续多页缺失（已排除封面 1–2 页）');
  md.push('');
  if (!multiPageGaps.length) {
    md.push('_无_');
  } else {
    md.push('| 分册 | 相对页 | 缺页数 | PDF总页 |');
    md.push('|---|---|---:|---:|');
    for (const g of multiPageGaps) {
      md.push(
        `| ${g.section} | ${g.relativeFrom}–${g.relativeTo} | ${g.pagesMissing} | ${g.pdfTotal} |`
      );
    }
  }
  md.push('');
  md.push('## 单页提取骤降（条目数 ≤ 分册中位数 15%，最多列 80）');
  md.push('');
  md.push('| 分册 | 相对页 | 条目 | 中位数 | 比例 |');
  md.push('|---|---:|---:|---:|---:|');
  for (const t of thinPages.slice(0, 80)) {
    md.push(
      `| ${t.section} | ${t.relativePage} | ${t.entries} | ${t.medianAround} | ${t.ratio} |`
    );
  }
  md.push('');
  md.push(payload.note.map((n) => `- ${n}`).join('\n'));
  writeFileSync(join(OUT_DIR, 'index-coverage-audit.md'), md.join('\n'));

  console.log(JSON.stringify(payload.summary, null, 2));
  console.log(`Wrote ${join(OUT_DIR, 'index-coverage-audit.md')}`);
  if (multiPageGaps[0]) {
    console.log('Worst gap:', multiPageGaps[0]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
