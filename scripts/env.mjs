/**
 * CLI スクリプト用の簡易 .env ローダー。
 * Next.js は .env.local を自動で読みますが、素の node 実行では読まれないため。
 */
import fs from 'node:fs';
import path from 'node:path';

for (const file of ['.env.local', '.env']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
