import { NextResponse } from 'next/server';
import { finalizeLeague, getLeague, isOrganizer } from '@/lib/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** リーグの確定。主催者だけが実行できる */
export async function POST(req, { params }) {
  try {
    const leagueId = Number(params.id);
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'リーグが存在しません' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const efootballId = String(body.efootball_id || '').trim();

    if (!efootballId) {
      return NextResponse.json({ error: '主催者の efootball ID を入力してください' }, { status: 400 });
    }
    if (!(await isOrganizer(leagueId, efootballId))) {
      return NextResponse.json(
        { error: `結果を確定できるのは主催者（${league.organizer_efootball_id ?? '未設定'}）だけです` },
        { status: 403 }
      );
    }

    await finalizeLeague(leagueId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
