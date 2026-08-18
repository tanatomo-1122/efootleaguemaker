import OpenAI from 'openai';
import { STAT_KEYS } from './schema.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const FIELD_DOC = STAT_KEYS.map((s) => `  - ${s.key}: ${s.label}`).join('\n');

const SYSTEM_PROMPT = `あなたは eFootball の試合結果スクリーンショットを読み取る専門のデータ入力アシスタントです。
画像は定型フォーマットで構成されています。以下の画面レイアウト構造を前提にデータを抽出してください。

【画面レイアウトの空間構造】
1. ヘッダー部分（最上部）
   - 左から順に「ホームチーム名」「ホームの得点」「アウェイの得点」「アウェイチーム名」が横に並んでいます。
2. スタッツ部分（画面中央から下部）
   - 画面中央の列に、抽出対象の「項目名（ラベル）」が縦に並んでいます。
   - 項目名のすぐ左側にある数値が「ホームの数値」です。
   - 項目名のすぐ右側にある数値が「アウェイの数値」です。

【読み取るスタッツ項目（中央列のラベル）】
${FIELD_DOC}

【出力ルール】
- 必ず JSON オブジェクトのみを出力すること。
- チーム名はスカッド名であり、ロゴの横やスコアの横にある画面上の表記をそのまま返すこと。
- パーセント項目(possession, pass_success)は % を外した数値だけを入れること。
- 読み取れない項目は null にすること。推測で数値を作らないこと。`;

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

  // 返ってこないときに関数を占有し続けないよう、必ず時間で打ち切る。
  // 再試行も1回まで（既定の2回だと最悪 3 倍待つことになる）。
  const client = new OpenAI({
    apiKey,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 40000),
    maxRetries: 1,
  });

  let res;
  try {
    res = await client.chat.completions.create({
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
  } catch (e) {
    // 時間切れ・混雑は「手入力してください」に落とす（画面は止めない）
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
