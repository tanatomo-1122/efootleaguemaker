/**
 * AI が返した JSON を home_<key> / away_<key> の平らな形にそろえる。
 *
 * なぜ要るか:
 *   モデルは指示しても形をぶらす。実際に観測された返り方だけでも
 *     A) {"home_shots": 2, "away_shots": 5}                     ← 期待どおり
 *     B) {"home": {"shots": 2}, "away": {"shots": 5}}           ← side が外側
 *     C) {"shots": {"home": 2, "away": 5}}                      ← 項目が外側
 *     D) {"stats": [{"label":"シュート","home":2,"away":5}]}     ← 配列
 *     E) {"シュート": {"ホーム": 2, "アウェイ": 5}}               ← 日本語キー
 *     F) {"shots_home": 2, "shots_away": 5}                     ← 接尾辞
 *   と何通りもある。表に出す側がキー名を直接見ているので、
 *   B〜F はすべて「JSONには写っているのに画面は空欄」になる。
 *   ここで全部 A に寄せる。
 */

import { STAT_KEYS } from './schema.js';

/** 比較用に文字をそろえる（全角→半角、空白・記号・かっこを除去） */
const canon = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s（）()%％:：]/g, '');

/** 別名照合用（さらに _ と - を落とす） */
const alias = (s) => canon(s).replace(/[_\-]/g, '');

// team_name もスタッツと同じ枠組みで扱う（side + 項目 の2軸に統一するため）
export const FIELD_KEYS = ['team_name', ...STAT_KEYS.map((s) => s.key)];

/** 項目名の別名表。左が別名、右が正式キー */
const FIELD_ALIASES = new Map();
const addAlias = (name, key) => FIELD_ALIASES.set(alias(name), key);

for (const s of STAT_KEYS) {
  addAlias(s.key, s.key);
  addAlias(s.label, s.key);
}
[
  ['team_name', 'team_name'], ['teamname', 'team_name'], ['team', 'team_name'],
  ['teams', 'team_name'], ['teamnames', 'team_name'],
  ['squad', 'team_name'], ['squadname', 'team_name'], ['clubname', 'team_name'],
  ['チーム名', 'team_name'], ['チーム', 'team_name'], ['スカッド名', 'team_name'], ['スカッド', 'team_name'],

  ['score', 'score'], ['goals', 'score'], ['goal', 'score'], ['得点', 'score'], ['ゴール', 'score'], ['スコア', 'score'],

  ['possession', 'possession'], ['possessionrate', 'possession'], ['ballpossession', 'possession'],
  ['ボール支配率', 'possession'], ['ポゼッション', 'possession'],

  ['shots', 'shots'], ['shot', 'shots'], ['totalshots', 'shots'], ['シュート数', 'shots'],
  ['shotsongoal', 'shots_goal'], ['shotsontarget', 'shots_goal'], ['ontargetshots', 'shots_goal'],
  ['枠内シュート数', 'shots_goal'], ['枠内', 'shots_goal'],

  ['fouls', 'fouls'], ['foul', 'fouls'], ['ファール', 'fouls'],
  ['offsides', 'offsides'], ['offside', 'offsides'],
  ['corners', 'corners'], ['corner', 'corners'], ['cornerkicks', 'corners'], ['ck', 'corners'],
  ['freekicks', 'free_kicks'], ['freekick', 'free_kicks'], ['fk', 'free_kicks'], ['フリーキック', 'free_kicks'],

  ['passes', 'passes'], ['pass', 'passes'], ['totalpasses', 'passes'], ['パス数', 'passes'],
  ['passsuccess', 'pass_success'], ['successfulpasses', 'pass_success'], ['passescompleted', 'pass_success'],
  ['passaccuracy', 'pass_success'], ['パス成功数', 'pass_success'],

  ['cross', 'cross'], ['crosses', 'cross'], ['クロス数', 'cross'],
  ['passcut', 'pass_cut'], ['interceptions', 'pass_cut'], ['interception', 'pass_cut'], ['インターセプト', 'pass_cut'],
  ['tacklesuccess', 'tackle_success'], ['successfultackles', 'tackle_success'], ['tackles', 'tackle_success'],
  ['tackle', 'tackle_success'], ['タックル', 'tackle_success'],
  ['saves', 'saves'], ['save', 'saves'], ['セーブ数', 'saves'],
].forEach(([n, k]) => addAlias(n, k));

const SIDE_WORDS = {
  home: 'home', h: 'home', left: 'home', l: 'home', ホーム: 'home', 左: 'home', 自分: 'home',
  away: 'away', a: 'away', right: 'away', r: 'away', アウェイ: 'away', アウェー: 'away', 右: 'away', 相手: 'away',
};

const LABEL_FIELDS = ['label', 'name', 'key', 'stat', 'item', 'title', '項目', 'ラベル'];

function sideOf(name) {
  return SIDE_WORDS[canon(name)] ?? null;
}
function fieldOf(name) {
  return FIELD_ALIASES.get(alias(name)) ?? null;
}

/** キー1つを {side, field} に分解する */
function splitKey(k) {
  const direct = fieldOf(k);
  if (direct) return { side: null, field: direct };

  const side = sideOf(k);
  if (side) return { side, field: null };

  const c = canon(k);
  let m = c.match(/^(home|away|left|right|ホーム|アウェイ|アウェー)[_\-]?(.+)$/);
  if (m) return { side: sideOf(m[1]), field: fieldOf(m[2]) };

  m = c.match(/^(.+?)[_\-](home|away|left|right)$/);
  if (m) return { side: sideOf(m[2]), field: fieldOf(m[1]) };

  return { side: null, field: null };
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).normalize('NFKC').replace(/[,\s%]/g, '');
  if (s === '' || /^(null|none|n\/a|-|—|不明)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * @param {any} raw AI が返した JSON
 * @returns {{stats: object, unmapped: string[], shape: 'flat'|'converted'|'empty'}}
 */
export function normalizeParsed(raw) {
  const out = {};
  const unmapped = [];

  const put = (side, field, value) => {
    if (!side || !field) return false;
    const key = `${side}_${field}`;
    const val = field === 'team_name' ? toText(value) : toNumber(value);
    if (val === null || val === undefined) return false;
    if (out[key] !== undefined && out[key] !== null) return false; // 先に入った方を優先
    out[key] = val;
    return true;
  };

  const walk = (node, ctx, path) => {
    if (node === null || node === undefined) return;

    if (typeof node !== 'object') {
      if (put(ctx.side, ctx.field, node)) return;
      // {"home": "つながリーヨ"} のように side だけ決まっていて中身が
      // 数値でない文字列なら、チーム名とみなす
      if (ctx.side && !ctx.field && typeof node === 'string' && toNumber(node) === null) {
        if (put(ctx.side, 'team_name', node)) return;
      }
      if (String(node).trim() !== '' && path) unmapped.push(path);
      return;
    }

    if (Array.isArray(node)) {
      // [home, away] の2要素配列
      if (ctx.field && node.length === 2 && node.every((v) => typeof v !== 'object')) {
        put('home', ctx.field, node[0]);
        put('away', ctx.field, node[1]);
        return;
      }
      node.forEach((v, i) => walk(v, ctx, `${path}[${i}]`));
      return;
    }

    // {label:'シュート', home:2, away:5} のようなラベル付きオブジェクト
    let ctx2 = ctx;
    let labelKey = null;
    for (const lk of LABEL_FIELDS) {
      const f = typeof node[lk] === 'string' ? fieldOf(node[lk]) : null;
      if (f) {
        ctx2 = { ...ctx, field: f };
        labelKey = lk;
        break;
      }
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === labelKey) continue;
      const p = path ? `${path}.${k}` : k;
      const { side, field } = splitKey(k);
      const next = { side: side ?? ctx2.side, field: field ?? ctx2.field };
      if (!side && !field && typeof v !== 'object') {
        // value / 値 のような素通しキーは今のコンテキストで拾う
        if (ctx2.side && ctx2.field) put(ctx2.side, ctx2.field, v);
        else if (String(v ?? '').trim() !== '') unmapped.push(p);
        continue;
      }
      walk(v, next, p);
    }
  };

  walk(raw, { side: null, field: null }, '');

  // 期待キーをすべて埋める（無いものは null）
  const stats = {};
  for (const side of ['home', 'away']) {
    for (const f of FIELD_KEYS) {
      const key = `${side}_${f}`;
      stats[key] = out[key] ?? null;
    }
  }

  const filled = Object.values(stats).filter((v) => v !== null).length;
  // 元から平らな形で返ってきていたか（＝プロンプトが効いていたか）を見分ける
  const wasFlat =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.keys(raw).some((k) => /^(home|away)_/.test(k))
      : false;

  return {
    stats,
    unmapped,
    shape: filled === 0 ? 'empty' : wasFlat ? 'flat' : 'converted',
    filled,
  };
}
