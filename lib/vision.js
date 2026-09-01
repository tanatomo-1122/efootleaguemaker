import OpenAI from 'openai';
import { STAT_KEYS } from './schema.js';
import { normalizeParsed } from './vision-normalize.js';

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** 出力させる JSON のキー。ここが唯一の正解で、プロンプトにもスキーマにも同じものを流し込む */
export const OUTPUT_FIELDS = [
  { key: 'home_team_name', type: 'string', note: '画面左のチーム名（スコアの左隣）' },
  { key: 'away_team_name', type: 'string', note: '画面右のチーム名（スコアの右隣）' },
  ...STAT_KEYS.flatMap((s) =>
    s.key === 'score'
      ? [
          { key: 'home_score', type: 'number', note: '最上部の帯にある左側の得点' },
          { key: 'away_score', type: 'number', note: '最上部の帯にある右側の得点' },
        ]
      : [
          { key: `home_${s.key}`, type: 'number', note: `中央のラベル「${s.label}」の左の数値` },
          { key: `away_${s.key}`, type: 'number', note: `中央のラベル「${s.label}」の右の数値` },
        ]
  ),
];

const KEY_DOC = OUTPUT_FIELDS.map(
  (f) => `  "${f.key}": ${f.type === 'string' ? '文字列 または null' : '数値 または null'},   // ${f.note}`
).join('\n');

/** Structured Outputs 用のスキーマ（対応モデルなら形が保証される） */
export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: OUTPUT_FIELDS.map((f) => f.key),
  properties: Object.fromEntries(
    OUTPUT_FIELDS.map((f) => [f.key, { type: [f.type, 'null'], description: f.note }])
  ),
};

export const SYSTEM_PROMPT = `あなたは eFootball の試合結果スクリーンショットを読み取る、データ入力専門のアシスタントです。

【画面レイアウト】
1. 最上部の帯: 左から「左チーム名」「左の得点」「右の得点」「右チーム名」の順に横一列。
2. 画面中央: 抽出対象の項目名（ラベル）が縦に並ぶ。
   - ラベルのすぐ左の数値 = 左チームの値
   - ラベルのすぐ右の数値 = 右チームの値
3. 左右のチームロゴは、それぞれのチーム名と同じ側に表示される。

【呼び方の固定】
   画面の「左」を home、画面の「右」を away と必ず呼ぶこと。
   どちらが本当のホームかは考えなくてよい。見えている位置だけで決めること。

【出力する JSON】
必ず次のキーだけを持つ 1 個の JSON オブジェクトを出力すること。
キーは1文字も変えず、増やさず、減らさないこと。

{
${KEY_DOC}
}

【禁止事項（過去に実際に起きた誤りです）】
- 入れ子にしないこと。{"home": {...}, "away": {...}} は誤り。
- 項目を外側にしないこと。{"shots": {"home": 2, "away": 5}} は誤り。
- 配列にしないこと。{"stats": [...]} は誤り。
- 日本語のキーを使わないこと。{"シュート": ...} は誤り。
- 上記以外のキー（confidence, notes, match など）を足さないこと。

【値のルール】
- 数値は半角のアラビア数字のみ。% や単位、カンマ、引用符を付けない。（例: "62%" ではなく 62）
- 左右を絶対に取り違えないこと。1行ずつ「左の数値 → ラベル → 右の数値」の順に目で追い、そのまま home → away に入れる。
- 読み取れない項目は null。推測で数値を作らない。

【チーム名】
- 日本語（ひらがな・カタカナ・漢字）のことが多い。「あ」のように1文字だけの名前も実在する。
- 画面に表示されている文字をそのまま返す。ローマ字に直したり、意味の通る言葉に補正したりしない。
- 実在クラブのロゴが表示されていても、チーム名はロゴではなく文字表記を読むこと。`;

export const USER_PROMPT =
  'このスクリーンショットを、指定された JSON のキーのとおりに書き起こしてください。';

function buildSystemPrompt(base, teamHints) {
  const hints = (teamHints || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (hints.length === 0) return base;
  return `${base}

【チーム名の候補】
この試合に登録されているチーム名は次のいずれかです。画面の文字がこの候補のどれかと読めるなら、
候補の表記をそのまま使ってください（部分的にしか読めなくても、候補に一致するなら候補の表記を優先）。
${hints.map((h) => `  - ${h}`).join('\n')}
どの候補とも違って見える場合は、無理に当てはめず画面のとおりに返してください。`;
}

/**
 * 画像1枚から試合スタッツを抽出する。
 *
 * @param {string} base64Image
 * @param {string} mediaType
 * @param {object} [options]
 * @param {string}   [options.model]        使用するモデル（既定: OPENAI_MODEL）
 * @param {'low'|'high'|'auto'} [options.detail] 画像の解像度指定（既定: 'high'）
 * @param {string}   [options.systemPrompt] システムプロンプトの差し替え
 * @param {string}   [options.userPrompt]   ユーザープロンプトの差し替え
 * @param {string[]} [options.teamHints]    登録済みチーム名の候補
 * @param {boolean}  [options.strictSchema] Structured Outputs を使う（既定: true）
 * @param {number}   [options.timeoutMs]
 * @param {boolean}  [options.withMeta]     true なら {data, meta} を返す
 */
export async function extractMatchStats(base64Image, mediaType, options = {}) {
  const {
    model = DEFAULT_MODEL,
    detail = 'high',
    systemPrompt = SYSTEM_PROMPT,
    userPrompt = USER_PROMPT,
    teamHints = [],
    strictSchema = true,
    timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 40000),
    withMeta = false,
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'OPENAI_API_KEY が未設定です。.env.local に設定するか、手入力で結果を登録してください。'
    );
    err.code = 'NO_API_KEY';
    throw err;
  }

  // 返ってこないときに関数を占有し続けないよう、必ず時間で打ち切る。
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });

  const messages = [
    { role: 'system', content: buildSystemPrompt(systemPrompt, teamHints) },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          // 細かい数字を読むので detail は既定で high
          image_url: { url: `data:${mediaType};base64,${base64Image}`, detail },
        },
      ],
    },
  ];

  const responseFormat = strictSchema
    ? {
        type: 'json_schema',
        json_schema: { name: 'efootball_match_stats', strict: true, schema: RESPONSE_SCHEMA },
      }
    : { type: 'json_object' };

  const startedAt = Date.now();
  let res;
  let usedFallback = null;
  try {
    const r = await createWithFallback(client, {
      model,
      temperature: 0,
      max_tokens: 2000,
      response_format: responseFormat,
      messages,
    });
    res = r.res;
    usedFallback = r.fallback;
  } catch (e) {
    const status = e?.status;
    if (e?.name === 'APIConnectionTimeoutError' || status === 408 || status === 504) {
      const err = new Error(
        'AI の読み取りが時間内に終わりませんでした。もう一度試すか、手入力で登録してください。'
      );
      err.code = 'AI_TIMEOUT';
      throw err;
    }
    if (status === 429) {
      const err = new Error(
        'AI が混み合っています。少し待ってから試すか、手入力で登録してください。'
      );
      err.code = 'AI_BUSY';
      throw err;
    }
    throw e;
  }
  const elapsedMs = Date.now() - startedAt;

  const text = res.choices?.[0]?.message?.content ?? '';
  const raw = parseJsonLoose(text);
  // どんな形で返ってきても home_xxx / away_xxx に寄せる
  const { stats, unmapped, shape, filled } = normalizeParsed(raw);

  if (!withMeta) return stats;
  return {
    data: stats,
    meta: {
      model: res.model || model,
      requested_model: model,
      detail,
      elapsed_ms: elapsedMs,
      usage: res.usage ?? null,
      finish_reason: res.choices?.[0]?.finish_reason ?? null,
      response_format: usedFallback ? `${responseFormat.type} → ${usedFallback}` : responseFormat.type,
      shape, // 'flat'（そのまま使えた）/ 'converted'（形がぶれたので変換した）/ 'empty'
      filled,
      unmapped,
      raw_json: raw,
      raw_text: text,
      team_hints: teamHints,
    },
  };
}

/**
 * モデルによっては json_schema / temperature / max_tokens を受け付けない。
 * 400 が返ったら該当パラメータを落として組み直す（最大2回）。
 */
async function createWithFallback(client, params) {
  let current = { ...params };
  let fallback = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { res: await client.chat.completions.create(current), fallback };
    } catch (e) {
      if (e?.status !== 400 || attempt === 2) throw e;
      const msg = String(e?.message || '');
      const next = { ...current };
      let retry = false;

      if (/json_schema|response_format/i.test(msg)) {
        if (next.response_format?.type === 'json_schema') {
          next.response_format = { type: 'json_object' };
          fallback = 'json_object';
        } else {
          delete next.response_format;
          fallback = 'none';
        }
        retry = true;
      }
      if (/temperature/i.test(msg)) {
        delete next.temperature;
        retry = true;
      }
      if (/max_tokens/i.test(msg) && /max_completion_tokens/i.test(msg)) {
        next.max_completion_tokens = current.max_tokens;
        delete next.max_tokens;
        retry = true;
      }
      if (!retry) throw e;
      current = next;
    }
  }
  throw new Error('unreachable');
}

export function parseJsonLoose(text) {
  const cleaned = String(text).replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI の応答を JSON として解釈できませんでした: ' + cleaned.slice(0, 200));
  }
}

export { normalizeParsed };
