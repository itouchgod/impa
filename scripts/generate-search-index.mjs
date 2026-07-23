#!/usr/bin/env node
/**
 * Prebuild IMPA search index from OCR Markdown.
 *
 * Input (default): /Users/roger/website/impa-pdf/outputs/sections/<section>/pages/page_XXXX.md
 * Override: OCR_SECTIONS_DIR=/path/to/outputs/sections
 *
 * Output: public/search-index.json
 *
 * Run: npm run build:index
 *
 * Legacy PDF.js text-layer indexer: scripts/generate-search-index-from-pdf.mjs
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PDF_CONFIG_PATH = join(ROOT, 'src/config/pdf.ts');
const OUTPUT_PATH = join(ROOT, 'public/search-index.json');
const DEFAULT_OCR_DIR = '/Users/roger/website/impa-pdf/outputs/sections';
const OCR_SECTIONS_DIR = process.env.OCR_SECTIONS_DIR || DEFAULT_OCR_DIR;

const DESCRIPTION_LIMIT = 200;
const INDEX_VERSION = '1.3';

const DET_RE =
  /<\|det\|>(?<label>\w+)\s+\[[^\]]*\]<\|\/det\|>(?<body>.*?)(?=<\|det\|>|$)/gs;

const FULL_SPACED = /^(\d{2})\s+(\d{2})\s+(\d{2})$/;
const FULL_COMPACT = /^(\d{6})$/;
const FULL_DOTTED = /^(\d{2})\.(\d{4})$/;
/** OCR 偶发多一位，如 33.42100 → 按 33.4210 处理 */
const FULL_DOTTED_LOOSE = /^(\d{2})\.(\d{4})\d$/;
const ABBR2 = /^(\d{2})$/;
const VARIANT_AABB_CC = /^(\d{2})(\d{2})\s+(\d{2})$/;
const VARIANT_AA_BBCC = /^(\d{2})\s+(\d{2})(\d{2})$/;
const SPACED_IN_TEXT = /\b(\d{2})\s+(\d{2})\s+(\d{2})\b/g;
const DOTTED_IN_TEXT = /\b(\d{2})\.(\d{4})\d?\b/g;

const HEADER_WORDS = new Set([
  'code',
  'colour',
  'color',
  'type',
  'size',
  'unit',
  'per',
  'pc',
  'pn',
  'part',
  'no',
  'nom',
  'inch',
  'description',
  'qty',
  'remarks',
]);

const DITTO_RE = /^["”″„‟]+$/;

function main() {
  console.log('Generating IMPA search index from OCR Markdown...');
  console.log(`  OCR dir: ${OCR_SECTIONS_DIR}`);

  if (!existsSync(OCR_SECTIONS_DIR)) {
    if (existsSync(OUTPUT_PATH)) {
      console.warn(
        `OCR sections directory not found: ${OCR_SECTIONS_DIR}\n` +
          `Keeping existing public/search-index.json (CI/deploy without local OCR).`
      );
      return;
    }

    throw new Error(
      `OCR sections directory not found: ${OCR_SECTIONS_DIR}\n` +
        'Set OCR_SECTIONS_DIR or place OCR output at the default path.'
    );
  }

  const siteSections = readSectionsFromPdfConfig();
  const logicalGroups = groupLogicalSections(siteSections);
  const ocrSectionNames = readdirSync(OCR_SECTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const allEntries = [];
  const stats = [];

  for (let index = 0; index < ocrSectionNames.length; index++) {
    const logicalName = ocrSectionNames[index];
    const group = logicalGroups.get(logicalName);

    if (!group) {
      console.warn(`  Skipping OCR section not in pdf.ts: ${logicalName}`);
      continue;
    }

    process.stdout.write(`  [${index + 1}/${ocrSectionNames.length}] ${logicalName}...`);

    const pageCount = countOcrPages(logicalName);
    if (pageCount !== group.totalPages) {
      console.warn(
        `\n    Warning: OCR pages (${pageCount}) != config pages (${group.totalPages})`
      );
    }

    const rawEntries = extractFromOcrSection(logicalName, group);
    const emptyNames = rawEntries.filter((entry) => !entry.name).length;
    allEntries.push(...rawEntries);
    stats.push({ logicalName, count: rawEntries.length, emptyNames, pageCount });
    console.log(` ${rawEntries.length} codes (empty name: ${emptyNames})`);
  }

  const deduped = dedupeEntries(allEntries);
  deduped.sort((a, b) => a.page - b.page || a.code.localeCompare(b.code));

  const searchIndex = {
    version: INDEX_VERSION,
    generated: new Date().toISOString().slice(0, 10),
    source: 'ocr-markdown',
    totalEntries: deduped.length,
    entries: deduped,
  };

  const output = JSON.stringify(searchIndex);
  writeFileSync(OUTPUT_PATH, output);

  const emptyTotal = deduped.filter((entry) => !entry.name).length;
  const sizeMB = (Buffer.byteLength(output) / 1024 / 1024).toFixed(2);
  const petroleum = deduped.filter((entry) => entry.sectionName === '45-Petroleum_Products').length;

  console.log(`\nDone. ${deduped.length} unique entries -> public/search-index.json (${sizeMB} MB)`);
  console.log(
    `  Empty names: ${emptyTotal} (${((100 * emptyTotal) / Math.max(deduped.length, 1)).toFixed(1)}%)`
  );
  console.log(`  45-Petroleum_Products: ${petroleum} entries`);

  if (petroleum === 0) {
    throw new Error('45-Petroleum_Products produced 0 entries — OCR indexing failed for that chapter.');
  }
}

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

function groupLogicalSections(siteSections) {
  const groups = new Map();

  for (const section of siteSections) {
    const logicalName = section.name.replace(/_part[12]$/, '');
    if (!groups.has(logicalName)) {
      groups.set(logicalName, {
        logicalName,
        parts: [],
        totalPages: 0,
        absoluteStart: Infinity,
      });
    }

    const group = groups.get(logicalName);
    group.parts.push(section);
    group.totalPages += section.endPage - section.startPage + 1;
    group.absoluteStart = Math.min(group.absoluteStart, section.startPage);
  }

  for (const group of groups.values()) {
    group.parts.sort((a, b) => a.startPage - b.startPage);
  }

  return groups;
}

function countOcrPages(logicalName) {
  const pagesDir = join(OCR_SECTIONS_DIR, logicalName, 'pages');
  if (!existsSync(pagesDir)) {
    return 0;
  }

  return readdirSync(pagesDir).filter((name) => /^page_\d+\.md$/.test(name)).length;
}

function getAllowedCodePrefixes(logicalName) {
  if (logicalName.startsWith('00_10-')) {
    return ['00', '10'];
  }

  const prefix = logicalName.match(/^(\d{2})/)?.[1];
  if (!prefix) {
    throw new Error(`Unable to infer IMPA code prefix from section name: ${logicalName}`);
  }

  return [prefix];
}

function mapOcrPageToSite(group, ocrRelativePage) {
  const absolutePage = group.absoluteStart + ocrRelativePage - 1;
  const part = group.parts.find(
    (section) => absolutePage >= section.startPage && absolutePage <= section.endPage
  );

  if (!part) {
    return null;
  }

  return {
    absolutePage,
    relativePage: absolutePage - part.startPage + 1,
    sectionName: part.name,
    filePath: part.filePath,
  };
}

function extractFromOcrSection(logicalName, group) {
  const pagesDir = join(OCR_SECTIONS_DIR, logicalName, 'pages');
  if (!existsSync(pagesDir)) {
    throw new Error(`OCR pages directory missing: ${pagesDir}`);
  }

  const allowed = getAllowedCodePrefixes(logicalName);
  const pageFiles = readdirSync(pagesDir)
    .filter((name) => /^page_\d+\.md$/.test(name))
    .sort();

  const entries = [];
  let prefix = null;

  for (const fileName of pageFiles) {
    const ocrRelativePage = Number(fileName.match(/page_(\d+)/)?.[1]);
    if (!ocrRelativePage) continue;

    const site = mapOcrPageToSite(group, ocrRelativePage);
    if (!site) {
      console.warn(`\n    Warning: OCR page ${ocrRelativePage} out of range for ${logicalName}`);
      continue;
    }

    const text = readFileSync(join(pagesDir, fileName), 'utf-8');
    const pageEntries = extractFromPage(text, allowed, prefix);
    prefix = pageEntries.nextPrefix;

    const seenOnPage = new Set();
    for (const item of pageEntries.entries) {
      if (seenOnPage.has(item.code)) continue;
      seenOnPage.add(item.code);

      entries.push({
        code: item.code,
        name: item.name,
        page: site.absolutePage,
        relativePage: site.relativePage,
        sectionName: site.sectionName,
        filePath: site.filePath,
      });
    }
  }

  return entries;
}

function extractFromPage(text, allowed, initialPrefix) {
  const blocks = parseDetBlocks(text);
  let productTitle = '';
  let subtitle = '';
  let aliases = '';
  let prefix = initialPrefix;
  let lastDesc = '';
  /** 标志类页面：编码常在 image_caption（33.4210），前一条 caption 多为符号名 */
  let lastCaption = '';
  const entries = [];

  for (const { label, body } of blocks) {
    if (label === 'title') {
      const title = normalizeSpace(body);
      if (isUsableTitle(title)) {
        if (isSubtitleTitle(title) && productTitle) {
          subtitle = title;
        } else {
          productTitle = title;
          subtitle = '';
          aliases = '';
        }
      }
      continue;
    }

    if (label === 'text') {
      const alias = normalizeSpace(body);
      if (isMultilingualAlias(alias) && productTitle && !aliases) {
        aliases = alias;
      }
    }

    if (label === 'image_caption') {
      const caption = normalizeSpace(body);
      const dotted = parseDottedCode(caption, allowed);
      if (dotted) {
        prefix = dotted.prefix;
        entries.push({
          code: dotted.code,
          name: buildName(productTitle, subtitle, lastCaption, aliases),
        });
        continue;
      }
      if (caption && !/^\d+\s*[×xX]\s*\d+/.test(caption)) {
        lastCaption = caption;
      }
    }

    if (label !== 'table') {
      SPACED_IN_TEXT.lastIndex = 0;
      let match;
      while ((match = SPACED_IN_TEXT.exec(body)) !== null) {
        const code = match[1] + match[2] + match[3];
        if (!isAllowedCode(code, allowed)) continue;
        prefix = [match[1], match[2]];
        entries.push({
          code,
          name: buildName(productTitle, subtitle, '', aliases),
        });
      }

      DOTTED_IN_TEXT.lastIndex = 0;
      while ((match = DOTTED_IN_TEXT.exec(body)) !== null) {
        const dotted = parseDottedCode(match[0], allowed);
        if (!dotted) continue;
        prefix = dotted.prefix;
        entries.push({
          code: dotted.code,
          name: buildName(productTitle, subtitle, '', aliases),
        });
      }
      continue;
    }

    const rows = parseTableRows(body);
    for (const row of rows) {
      for (let index = 0; index < row.length; index++) {
        const parsed = parseCodeCell(row[index], prefix, allowed);
        if (parsed) {
          prefix = parsed.prefix;
          let desc = descriptionFromRow(row, index);
          if (DITTO_RE.test(desc) || desc === '”' || desc === '"') {
            desc = lastDesc;
          } else if (desc) {
            lastDesc = desc;
          }

          entries.push({
            code: parsed.code,
            name: buildName(productTitle, subtitle, desc, aliases),
          });
          continue;
        }

        // 单元格内嵌多编码（如 "33.2140 - 33.2141 - 33.2140"）
        const embedded = extractEmbeddedCodes(row[index], allowed);
        for (const item of embedded) {
          prefix = item.prefix;
          entries.push({
            code: item.code,
            name: buildName(productTitle, subtitle, '', aliases),
          });
        }
      }
    }
  }

  return { entries, nextPrefix: prefix };
}

function parseDetBlocks(text) {
  const blocks = [];
  DET_RE.lastIndex = 0;
  let match;

  while ((match = DET_RE.exec(text)) !== null) {
    blocks.push({
      label: match.groups.label,
      body: match.groups.body.trim(),
    });
  }

  return blocks;
}

function parseTableRows(html) {
  const rows = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = rowMatch[1].matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi);

    for (const cellMatch of cellMatches) {
      cells.push(decodeBasicEntities(stripTags(cellMatch[2])).trim());
    }

    if (cells.some((cell) => cell)) {
      rows.push(cells);
    }
  }

  return rows;
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeBasicEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseDottedCode(raw, allowed) {
  const cell = normalizeSpace(raw);
  const match = cell.match(FULL_DOTTED) || cell.match(FULL_DOTTED_LOOSE);
  if (!match) return null;
  const code = match[1] + match[2];
  if (!isAllowedCode(code, allowed)) return null;
  return { code, prefix: [match[1], match[2].slice(0, 2)] };
}

/** 从长单元格/说明文字中抽出多个编码 */
function extractEmbeddedCodes(raw, allowed) {
  const cell = normalizeSpace(raw);
  if (!cell || cell.length < 6) return [];

  const found = [];
  const seen = new Set();

  DOTTED_IN_TEXT.lastIndex = 0;
  let match;
  while ((match = DOTTED_IN_TEXT.exec(cell)) !== null) {
    const dotted = parseDottedCode(match[0], allowed);
    if (!dotted || seen.has(dotted.code)) continue;
    seen.add(dotted.code);
    found.push(dotted);
  }

  SPACED_IN_TEXT.lastIndex = 0;
  while ((match = SPACED_IN_TEXT.exec(cell)) !== null) {
    const code = match[1] + match[2] + match[3];
    if (!isAllowedCode(code, allowed) || seen.has(code)) continue;
    seen.add(code);
    found.push({ code, prefix: [match[1], match[2]] });
  }

  return found;
}

function parseCodeCell(rawCell, prefix, allowed) {
  const cell = normalizeSpace(rawCell);
  if (!cell || isHeaderCell(cell)) return null;
  if (/\d{7,}/.test(cell)) return null;
  if (
    cell.length > 20 &&
    !FULL_SPACED.test(cell) &&
    !FULL_COMPACT.test(cell) &&
    !FULL_DOTTED.test(cell) &&
    !FULL_DOTTED_LOOSE.test(cell)
  ) {
    return null;
  }

  const dotted = parseDottedCode(cell, allowed);
  if (dotted) return dotted;

  for (const pattern of [FULL_SPACED, VARIANT_AABB_CC, VARIANT_AA_BBCC]) {
    const match = cell.match(pattern);
    if (!match) continue;

    const code = match[1] + match[2] + match[3];
    if (!isAllowedCode(code, allowed)) return null;
    return { code, prefix: [match[1], match[2]] };
  }

  const compact = cell.match(FULL_COMPACT);
  if (compact) {
    const code = compact[1];
    if (!isAllowedCode(code, allowed)) return null;
    return { code, prefix: [code.slice(0, 2), code.slice(2, 4)] };
  }

  if (prefix && ABBR2.test(cell)) {
    const code = prefix[0] + prefix[1] + cell;
    if (!isAllowedCode(code, allowed)) return null;
    return { code, prefix };
  }

  return null;
}

function descriptionFromRow(row, codeIndex) {
  for (let index = codeIndex + 1; index < row.length; index++) {
    const cell = normalizeSpace(row[index]);
    if (!cell) continue;
    if (looksLikeCodeCell(cell)) continue;
    if (isHeaderCell(cell)) continue;
    if (isSpamText(cell)) continue;
    return cell;
  }

  return '';
}

function looksLikeCodeCell(cell) {
  return (
    FULL_SPACED.test(cell) ||
    FULL_COMPACT.test(cell) ||
    FULL_DOTTED.test(cell) ||
    FULL_DOTTED_LOOSE.test(cell) ||
    ABBR2.test(cell) ||
    VARIANT_AABB_CC.test(cell) ||
    VARIANT_AA_BBCC.test(cell)
  );
}

function isHeaderCell(cell) {
  if (!cell) return true;
  if (isSpamText(cell)) return true;
  const lettersOnly = cell.toLowerCase().replace(/[^a-z]/g, '');
  return HEADER_WORDS.has(lettersOnly);
}

function isSpamText(value) {
  if (value.length > 40) {
    const counts = new Map();
    for (const char of value) {
      counts.set(char, (counts.get(char) || 0) + 1);
    }
    const max = Math.max(...counts.values());
    if (max > value.length * 0.45) return true;
  }

  return /(.)\1{8,}/.test(value) || /COPA3SLIP/i.test(value);
}

function isUsableTitle(title) {
  if (!title || title.length < 4) return false;
  if (/^\d+$/.test(title)) return false;
  if (isSpamText(title)) return false;
  return true;
}

function isSubtitleTitle(title) {
  return /^(with|for|without|\(|（)/i.test(title.trim());
}

/** Short multilingual product-name lines under a title (EN/ES/JA/ZH). */
function isMultilingualAlias(text) {
  if (!text || text.length < 2 || text.length > 90) return false;
  if (isSpamText(text)) return false;
  if (looksLikeCodeCell(normalizeSpace(text))) return false;
  const hasCjk = /[\u4e00-\u9fff\u3040-\u30ff]/.test(text);
  const hasLatin = /[A-Za-z]{3,}/.test(text);
  return hasCjk || (hasLatin && /\s/.test(text) && text.split(/\s+/).length <= 8);
}

function buildName(productTitle, subtitle, desc, aliases = '') {
  const parts = [];
  if (productTitle) parts.push(productTitle);
  if (subtitle && (!productTitle || !productTitle.toLowerCase().includes(subtitle.toLowerCase()))) {
    parts.push(subtitle);
  }
  if (aliases && !parts.some((part) => part.toLowerCase().includes(aliases.toLowerCase()))) {
    parts.push(aliases);
  }

  let base = parts.join(' ');
  const cleanDesc = normalizeSpace(desc)
    .replace(/[，,]+$/g, '')
    .trim();

  if (cleanDesc && !DITTO_RE.test(cleanDesc)) {
    if (!base) {
      base = cleanDesc;
    } else if (!base.toLowerCase().includes(cleanDesc.toLowerCase())) {
      base = `${base} — ${cleanDesc}`;
    }
  }

  return normalizeDescription(base);
}

function normalizeDescription(value) {
  const trimmed = normalizeSpace(value);
  if (!trimmed || trimmed.length < 2) return '';
  if (isSpamText(trimmed)) return '';
  return trimmed.slice(0, DESCRIPTION_LIMIT);
}

function normalizeSpace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllowedCode(code, allowed) {
  return allowed.some((prefix) => code.startsWith(prefix));
}

function dedupeEntries(entries) {
  const byCode = new Map();

  for (const entry of entries) {
    const existing = byCode.get(entry.code);
    if (!existing) {
      byCode.set(entry.code, entry);
      continue;
    }

    const existingScore = nameScore(existing.name);
    const nextScore = nameScore(entry.name);
    if (nextScore > existingScore || (nextScore === existingScore && entry.page < existing.page)) {
      byCode.set(entry.code, entry);
    }
  }

  return Array.from(byCode.values());
}

function nameScore(name) {
  if (!name) return 0;
  let score = Math.min(name.length, 80);
  if (name.includes('—')) score += 10;
  if (/[\u4e00-\u9fff]/.test(name)) score += 5;
  return score;
}

main();
