import { NextResponse } from 'next/server';
import { saveUpload, fileToBase64 } from '@/lib/storage';
import { extractMatchStats } from '@/lib/vision';
import { matchSquadNames, getMatch } from '@/lib/league';
import { STAT_KEYS } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 試合結果の写真を受け取り、AI がスタッツを読み取って返す。
 * 登録スカッド名との自動照合まで行い、必要なら home/away を入れ替えて返す。
 * 保存はしない(ユーザーが確認してから /result で確定する)。
 */
export async function POST(req, { params }) {
  const matchId = Number(params.id);
  const match = await getMatch(matchId);
  if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

  let imagePath = null;
  try {
    const form = await req.formData();
    const file = form.get('image');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: '画像を選択してください' }, { status: 400 });
    }

    // ブラウザ側で圧縮しているので、ここに大きな画像は来ないはず。
    // 来たら早めに断る（Vercel のボディ上限 4.5MB に当たる前に）。
    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `画像が大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。` +
            'スクリーンショットを撮り直すか、手入力で登録してください。',
        },
        { status: 413 }
      );
    }

    imagePath = await saveUpload(file, `match${matchId}`);
    const { base64, mediaType } = await fileToBase64(file);
    // 登録済みのスカッド名を候補として渡す。
    // 日本語（特にひらがな1文字）のチーム名はモデルが読み違えやすいので、
    // 「この2つのどちらか」と教えておくと照合の成功率が上がる。
    const parsed = await extractMatchStats(base64, mediaType, {
      teamHints: [match.home_team_name, match.away_team_name],
    });

    // --- 登録スカッド名との自動照合 ---
    const direction = matchSquadNames(match, parsed.home_team_name, parsed.away_team_name);
    const stats = {};
    for (const { key } of STAT_KEYS) {
      const h = parsed[`home_${key}`];
      const a = parsed[`away_${key}`];
      // 画像の左右が登録と逆なら入れ替える
      stats[`home_${key}`] = direction === 'swapped' ? a ?? '' : h ?? '';
      stats[`away_${key}`] = direction === 'swapped' ? h ?? '' : a ?? '';
    }

    return NextResponse.json({
      ok: true,
      image_path: imagePath,
      direction, // 'normal' | 'swapped' | null
      matched: direction !== null,
      parsed_home_team_name: parsed.home_team_name ?? '',
      parsed_away_team_name: parsed.away_team_name ?? '',
      confidence: parsed.confidence ?? null,
      notes: parsed.notes ?? '',
      stats,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message, code: e.code ?? null, image_path: imagePath },
      { status: e.code === 'NO_API_KEY' ? 503 : 500 }
    );
  }
}
