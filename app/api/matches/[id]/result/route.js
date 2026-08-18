import { NextResponse } from 'next/server';
import { getLeague, getMatch, saveMatchResult } from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 詰まっても関数を長時間占有しないよう、上限を明示する
export const maxDuration = 15;

/** ホーム側が結果を登録する（アウェイの承認待ちになる） */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const body = await req.json();
    const stats = body.stats || {};

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    // リーグ側の都合は、誰が来ても同じ結果になるので先に見る
    const league = await getLeague(match.league_id);
    if (league.cancelled) {
      return NextResponse.json({ error: 'このリーグは中止されています' }, { status: 400 });
    }
    if (league.status === 'finished') {
      return NextResponse.json({ error: 'このリーグは確定済みです' }, { status: 400 });
    }

    // --- 本人確認: 結果を登録できるのはホーム側のみ ---
    await authenticateAs(
      body.efootball_user_id,
      match.home_user_id,
      `結果を登録できるのはホーム側（${match.home_user_name}）だけです。` +
        `アウェイの方は、ホームの登録後に承認をお願いします。`
    );

    if (stats.home_score === '' || stats.home_score == null ||
        stats.away_score === '' || stats.away_score == null) {
      return NextResponse.json({ error: '得点(スコア)は必須です' }, { status: 400 });
    }

    await saveMatchResult(matchId, stats, {
      imagePath: body.image_path ?? null,
      source: body.source ?? 'manual',
    });

    return NextResponse.json({
      ok: true,
      status: 'pending',
      awaiting: match.away_user_name,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
