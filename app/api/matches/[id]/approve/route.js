import { NextResponse } from 'next/server';
import { getMatch, approveMatch, rejectMatch, canFinalize, getLeague } from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * アウェイ側が、ホームの登録した結果を承認 / 差し戻しする。
 * body: { efootball_user_id, action: 'approve' | 'reject', note }
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const body = await req.json();
    const action = body.action === 'reject' ? 'reject' : 'approve';

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    const league = await getLeague(match.league_id);
    if (league.status === 'finished') {
      return NextResponse.json({ error: 'このリーグは確定済みです' }, { status: 400 });
    }

    // --- 本人確認: 承認できるのはアウェイ側のみ ---
    await authenticateAs(
      body.efootball_user_id,
      match.away_user_id,
      `承認できるのはアウェイ側（${match.away_user_name}）だけです。`
    );

    if (action === 'approve') {
      await approveMatch(matchId);
      return NextResponse.json({
        ok: true,
        status: 'reported',
        can_finalize: await canFinalize(match.league_id),
      });
    }

    await rejectMatch(matchId, body.note);
    return NextResponse.json({ ok: true, status: 'scheduled' });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
