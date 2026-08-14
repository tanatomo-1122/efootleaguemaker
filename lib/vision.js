import OpenAI from 'openai';
import { STAT_KEYS } from './schema.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const FIELD_DOC = STAT_KEYS.map((s) => `  - ${s.key}: ${s.label}`).join('\n');

const SYSTEM_PROMPT = `あなたは eFootball の試合結果スクリーンショットを読み取る専門のデータ入力アシスタントです。
画像はスコア画面またはマッチスタッツ画面です。左側がホーム、右側がアウェイとして扱ってください。

読み取る項目(左右それぞれ):
${FIELD_DOC}

出力ルール:
- 必ず JSON オブジェクトのみを出力すること。
- 形式:
  {
    "home_team_name": string,
    "away_team_name": string,
    "home_score": number, "away_score": number,
    "home_possession": number, ... (全項目を home_<key> / away_<key> で)
    "confidence": 0〜1 の数値,
    "notes": 読み取れなかった項目があればその説明(なければ空文字)
  }
- パーセント項目(possession, pass_success)は % を外した数値だけを入れること。
- 読み取れない項目は null にすること。推測で数値を作らないこと。
- チーム名はスカッド名(クラブ名)であり、画面上の表記をそのまま返すこと。`;

/** 画像1枚から試合スタッツを抽出する（GPT-4o mini のビジョン機能を使用） */
export async function extractMatchStats(base64Image, mediaType) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'OPENAI_API_KEY が未設定です。.env.local に設定するか、手入力で結果を登録してください。'
    );
    err.code = 'NO_API_KEY';
    throw err;
  }

  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' }, // JSON 以外を返させない
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'この試合結果を JSON で書き起こしてください。' },
          {
            type: 'image_url',
            // 細かい数字を読むので detail は high
            image_url: { url: `data:${mediaType};base64,${base64Image}`, detail: 'high' },
          },
        ],
      },
    ],
  });

  const text = res.choices?.[0]?.message?.content ?? '';
  return parseJsonLoose(text);
}

function parseJsonLoose(text) {
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
