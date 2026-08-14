import { NextResponse } from 'next/server';
import { getMatch, approveMatch, rejectMatch, canFinalize, getLeague } from '@/lib/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * アウェイ側が、ホームの登録した結果を承認 / 差し戻しする。
 * body: { efootball_id, action: 'approve' | 'reject', note }
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const body = await req.json();
    const efootballId = String(body.efootball_id || '').trim();
    const action = body.action === 'reject' ? 'reject' : 'approve';

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    const league = await getLeague(match.league_id);
    if (league.status === 'finished') {
      return NextResponse.json({ error: 'このリーグは確定済みです' }, { status: 400 });
    }

    // --- 本人確認: 承認できるのはアウェイ側のみ ---
    if (!efootballId) {
      return NextResponse.json({ error: 'あなたの efootball ID を入力してください' }, { status: 400 });
    }
    if (efootballId.toLowerCase() !== String(match.away_efootball_id).toLowerCase()) {
      return NextResponse.json(
        { error: `承認できるのはアウェイ側（${match.away_efootball_id}）だけです。` },
        { status: 403 }
      );
    }

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
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
