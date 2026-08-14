/**
 * 運営用: Supabase(PostgreSQL) から CSV を取り出す（サイト上には配布口を置かない）
 *
 *   npm run export                  … exports/ に出力
 *   npm run export -- --out /path   … 出力先を指定
 *   npm run export -- --stdout matches.csv  … 標準出力へ
 */
import './env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { CSV_FILES } from '../lib/csv.js';
import { sql } from '../lib/db.js';

const args = process.argv.slice(2);
const getOpt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const stdoutTarget = getOpt('--stdout');

if (stdoutTarget) {
  const build = CSV_FILES[stdoutTarget];
  if (!build) {
    console.error(`不明なファイル名です: ${stdoutTarget}（${Object.keys(CSV_FILES).join(' / ')}）`);
    process.exit(1);
  }
  process.stdout.write(await build());
  await sql.end();
  process.exit(0);
}

const outDir = path.resolve(getOpt('--out') || path.join(process.cwd(), 'exports'));
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

for (const [name, build] of Object.entries(CSV_FILES)) {
  const csv = await build();
  const rows = Math.max(0, csv.split('\n').length - 1);
  // BOM 付きで書き出す（Excel での文字化け防止）
  const file = path.join(outDir, name.replace('.csv', `_${stamp}.csv`));
  fs.writeFileSync(file, '﻿' + csv, 'utf8');
  console.log(`${name.padEnd(12)} ${String(rows).padStart(5)} 行  →  ${file}`);
}

console.log('\n完了しました。これらのファイルは運営限定の資産です。取り扱いに注意してください。');
await sql.end();
