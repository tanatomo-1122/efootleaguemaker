import { NextResponse } from 'next/server';
import {
  extractMatchStats,
  SYSTEM_PROMPT,
  USER_PROMPT,
  DEFAULT_MODEL,
  OUTPUT_FIELDS,
} from '@/lib/vision';
import { STAT_KEYS } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI 読み取りの検証専用エンドポイント。
 *
 * 本番の /api/matches/[id]/analyze と違い、
 *   - DB を引かない（試合IDが要らない）
 *   - Supabase Storage に保存しない
 *   - home/away の自動入れ替えをしない（AI が返した生の左右をそのまま見せる）
 * ので「AI が画像から何を読めたか」だけを純粋に確認できる。
 */

// 本番環境では既定で無効。使いたい場合は ENABLE_VISION_TEST=1 を設定する。
function isEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_VISION_TEST === '1';
}

const DISABLED = NextResponse.json(
  { error: 'この検証用エンドポイントは無効です（ENABLE_VISION_TEST=1 で有効化）' },
  { status: 404 }
);

/** 画面側が既定値（現行のプロンプト・モデル・項目一覧）を取得するため */
export async function GET() {
  if (!isEnabled()) return DISABLED;
  return NextResponse.json({
    ok: true,
    default_model: DEFAULT_MODEL,
    system_prompt: SYSTEM_PROMPT,
    user_prompt: USER_PROMPT,
    stat_keys: STAT_KEYS,
    output_fields: OUTPUT_FIELDS,
    has_api_key: Boolean(process.env.OPENAI_API_KEY),
  });
}

export async function POST(req) {
  if (!isEnabled()) return DISABLED;

  try {
    const form = await req.formData();
    const file = form.get('image');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: '画像を選択してください' }, { status: 400 });
    }

    const model = String(form.get('model') || '').trim() || DEFAULT_MODEL;
    const detail = String(form.get('detail') || 'high');
    const systemPrompt = String(form.get('system_prompt') || '') || SYSTEM_PROMPT;
    const userPrompt = String(form.get('user_prompt') || '') || USER_PROMPT;
    const label = String(form.get('label') || '');
    const strictSchema = String(form.get('strict_schema') ?? '1') !== '0';
    const teamHints = String(form.get('team_hints') || '')
      .split(/[,、\n]/)
      .map((v) => v.trim())
      .filter(Boolean);

    const buf = Buffer.from(await file.arrayBuffer());
    const mediaType = String(file.type || 'image/png');
    const base64 = buf.toString('base64');

    const { data, meta } = await extractMatchStats(base64, mediaType, {
      model,
      detail: ['low', 'high', 'auto'].includes(detail) ? detail : 'high',
      systemPrompt,
      userPrompt,
      teamHints,
      strictSchema,
      withMeta: true,
    });

    return NextResponse.json({
      ok: true,
      label,
      image: {
        name: file.name ?? '',
        type: mediaType,
        bytes: buf.length,
        // base64 は約4/3に膨らむ。AI に実際に渡した量の目安として返す。
        base64_length: base64.length,
      },
      meta,
      parsed: data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message, code: e.code ?? null, status: e.status ?? null },
      { status: 500 }
    );
  }
}
