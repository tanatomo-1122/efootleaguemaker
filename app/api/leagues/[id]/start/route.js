import { NextResponse } from 'next/server';
import { getLeague, forceStartLeague, changeLeagueSize } from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 主催者向けの開始まわりの操作。
 * body: { efootball_user_id, action: 'start' | 'resize', players_per_pool, pool_count }
 *
 *   start  … 定員に届いていなくても、今いる人数で開始する
 *   resize … 募集人数（プール数 / 1プールの人数）を変更する
 */
export async function POST(req, { params }) {
  try {
    const leagueId = Number(params.id);
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'リーグが存在しません' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const action = body.action === 'resize' ? 'resize' : 'start';

    await authenticateAs(
      body.efootball_user_id,
      league.organizer_user_id,
      `この操作ができるのは主催者（${league.organizer_user_name ?? '未設定'}）だけです`
    );

    if (action === 'resize') {
      const result = await changeLeagueSize(leagueId, body.players_per_pool, body.pool_count);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await forceStartLeague(leagueId);
    return NextResponse.json({ ok: true, started: true, ...result });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
