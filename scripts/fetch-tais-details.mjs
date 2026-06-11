// TAIS詳細ページから製品概要・仕様を取得して public/tais-details.json に保存する
// 使い方: node scripts/fetch-tais-details.mjs
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX_PATH = join(root, 'public', 'stock.xlsx');
const OUT_PATH = join(root, 'public', 'tais-details.json');
const CONCURRENCY = 6;

// 在庫Excelから一意なTAISコードを収集(J列=商品コードの先頭 5〜6桁-6桁)
const wb = XLSX.read(readFileSync(XLSX_PATH));
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
const header = rows[0].map((h) => String(h ?? ''));
const iCode = header.indexOf('商品コード');
const codes = new Set();
for (const r of rows.slice(1)) {
  const m = /^(\d{5,6})-(\d{6})/.exec(String(r[iCode] ?? ''));
  if (m) codes.add(`${m[1]}-${m[2]}`);
}
console.log(`unique TAIS codes: ${codes.size}`);

// 既存JSONがあれば再利用(差分のみ取得)
const result = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
const targets = [...codes].filter((c) => !(c in result));
console.log(`to fetch: ${targets.length}`);

const strip = (s) =>
  s.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function fetchDetail(code) {
  const [c1, c2] = code.split('-');
  const url = `https://www.techno-aids.or.jp/ServiceWelfareGoodsDetail.php?RowNo=0&YouguCode1=${c1}&YouguCode2=${c2}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const html = await res.text();

    const sm = /製品概要<\/dt>[\s\S]*?<p class="c-block2__txt[^"]*">([\s\S]*?)<\/p>/.exec(html);
    const summary = sm ? strip(sm[1]) : '';

    const specs = [];
    const re = /<dt class="c-table3__th2?">([\s\S]*?)<\/dt>\s*<dd class="c-table3__td2?">([\s\S]*?)<\/dd>/g;
    let m;
    while ((m = re.exec(html)) && specs.length < 8) {
      const label = strip(m[1]);
      const value = strip(m[2]);
      if (label && value && value !== '無' && value !== '-') specs.push([label, value]);
    }
    if (!summary && specs.length === 0) return null;
    return { summary, specs };
  } catch {
    return null;
  }
}

let done = 0;
let found = 0;
async function worker(queue) {
  for (;;) {
    const code = queue.pop();
    if (!code) return;
    const detail = await fetchDetail(code);
    result[code] = detail ?? { summary: '', specs: [] };
    if (detail) found++;
    done++;
    if (done % 50 === 0) {
      console.log(`${done}/${targets.length} (found: ${found})`);
      writeFileSync(OUT_PATH, JSON.stringify(result));
    }
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
writeFileSync(OUT_PATH, JSON.stringify(result));
console.log(`done. total entries: ${Object.keys(result).length}, with data: ${found}`);
