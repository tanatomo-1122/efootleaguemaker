import { NextResponse } from 'next/server';
import { getLeague, cancelLeague, resumeLeague } from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * リーグの中止 / 再開。主催者だけが実行できる。
 * body: { efootball_user_id, action: 'cancel' | 'resume', reason }
 *
 * 中止しても行は消さず、cancelled_at を立てるだけ。
 * 募集一覧から隠れ、申し込みや結果の操作ができなくなる。
 */
export async function POST(req, { params }) {
  try {
    const leagueId = Number(params.id);
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'リーグが存在しません' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const action = body.action === 'resume' ? 'resume' : 'cancel';

    await authenticateAs(
      body.efootball_user_id,
      league.organizer_user_id,
      `リーグを${action === 'resume' ? '再開' : '中止'}できるのは主催者（${
        league.organizer_user_name ?? '未設定'
      }）だけです`
    );

    if (league.status === 'finished') {
      return NextResponse.json(
        { error: '確定済みのリーグは中止できません' },
        { status: 400 }
      );
    }

    if (action === 'resume') {
      await resumeLeague(leagueId);
      return NextResponse.json({ ok: true, cancelled: false });
    }

    await cancelLeague(leagueId, body.reason);
    return NextResponse.json({ ok: true, cancelled: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
