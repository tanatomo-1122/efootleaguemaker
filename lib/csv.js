import { sql } from './db.js';
import { MATCH_CSV_HEADER, SQUAD_CSV_HEADER, USER_CSV_HEADER } from './schema.js';

/**
 * CSV は運営だけが扱う資産のため、サイト上に配布用エンドポイントは置いていない。
 * 取り出しは `npm run export`（scripts/export.mjs）から行う。
 */

function esc(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header, rows) {
  return [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
}

/** matches.csv（アウェイの承認が済んだ試合のみ出力する） */
export async function matchesCsv() {
  const rows = await sql`
    SELECT * FROM matches WHERE status = 'reported' ORDER BY match_id
  `;
  return toCsv(MATCH_CSV_HEADER, rows);
}

/** squads.csv */
export async function squadsCsv() {
  const rows = await sql`SELECT * FROM squads ORDER BY squad_id`;
  return toCsv(SQUAD_CSV_HEADER, rows);
}

/** user.csv */
export async function usersCsv() {
  const rows = await sql`SELECT * FROM users ORDER BY user_id`;
  return toCsv(USER_CSV_HEADER, rows);
}

export const CSV_FILES = {
  'matches.csv': matchesCsv,
  'squads.csv': squadsCsv,
  'user.csv': usersCsv,
};
