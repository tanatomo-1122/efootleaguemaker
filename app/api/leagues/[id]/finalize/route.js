import { NextResponse } from 'next/server';
import { finalizeLeague, getLeague } from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** リーグの確定。主催者だけが実行できる（ユーザーIDで本人確認） */
export async function POST(req, { params }) {
  try {
    const leagueId = Number(params.id);
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'リーグが存在しません' }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    await authenticateAs(
      body.efootball_user_id,
      league.organizer_user_id,
      `結果を確定できるのは主催者（${league.organizer_user_name ?? '未設定'}）だけです`
    );

    await finalizeLeague(leagueId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
