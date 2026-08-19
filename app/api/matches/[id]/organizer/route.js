import { NextResponse } from 'next/server';
import {
  getLeague, getMatch, canFinalize,
  settleMatchByOrganizer, approveMatchByOrganizer, resetMatchByOrganizer,
} from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * 主催者による代理操作。相手が音信不通で進まないときの詰み防止。
 * body: { efootball_user_id, action: 'settle' | 'approve' | 'reset', stats, note }
 *
 *   settle  … 承認を待たずに結果を確定する（スコアだけでよい。不戦勝もこれ）
 *   approve … 承認待ちの結果を代理で承認する
 *   reset   … 確定した結果を取り消して未消化に戻す
 *
 * 誰がやったかは必ず DB に残り、画面にも「主催者が代理で確定」と表示される。
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    const league = await getLeague(match.league_id);
    if (league.cancelled) {
      return NextResponse.json({ error: 'このリーグは中止されています' }, { status: 400 });
    }
    if (league.status === 'finished') {
      return NextResponse.json({ error: 'このリーグは確定済みです' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action = ['settle', 'approve', 'reset'].includes(body.action) ? body.action : 'settle';

    const organizer = await authenticateAs(
      body.efootball_user_id,
      league.organizer_user_id,
      `代理で操作できるのは主催者（${league.organizer_user_name ?? '未設定'}）だけです`
    );

    if (action === 'approve') {
      await approveMatchByOrganizer(matchId, organizer.user_id, body.note);
    } else if (action === 'reset') {
      await resetMatchByOrganizer(matchId, organizer.user_id, body.note);
      return NextResponse.json({ ok: true, status: 'scheduled' });
    } else {
      await settleMatchByOrganizer(matchId, body.stats || {}, organizer.user_id, body.note);
    }

    return NextResponse.json({
      ok: true,
      status: 'reported',
      can_finalize: await canFinalize(match.league_id),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
