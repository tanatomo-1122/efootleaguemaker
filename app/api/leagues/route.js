import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { listLeagues } from '@/lib/league';
import { authenticate, AuthError } from '@/lib/auth';
import { CATEGORIES, DEFAULT_CATEGORY, canUseCategory, officialOrganizers } from '@/lib/rating';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 詰まっても関数を長時間占有しないよう、上限を明示する
export const maxDuration = 15;

export async function GET() {
  return NextResponse.json({ leagues: await listLeagues() });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const playersPerPool = Number(body.players_per_pool);
    const poolCount = Number(body.pool_count);

    if (!name) return NextResponse.json({ error: 'リーグ名を入力してください' }, { status: 400 });
    if (!(playersPerPool >= 2 && playersPerPool <= 16)) {
      return NextResponse.json({ error: '1リーグの人数は2〜16人で指定してください' }, { status: 400 });
    }
    if (!(poolCount >= 1 && poolCount <= 8)) {
      return NextResponse.json({ error: 'プール数は1〜8で指定してください' }, { status: 400 });
    }

    // 主催者はユーザーIDで本人確認する
    const organizer = await authenticate(body.efootball_user_id);

    // EFLランクの重要度を決めるカテゴリー。「公式」は運営者だけ
    const category = CATEGORIES[body.category] ? body.category : DEFAULT_CATEGORY;
    if (!canUseCategory(category, organizer.user_name)) {
      return NextResponse.json(
        {
          error: officialOrganizers().length
            ? '公式リーグを作れるのは運営者だけです'
            : '公式リーグは現在作成できません（運営者の設定が必要です）',
        },
        { status: 403 }
      );
    }

    const [league] = await sql`
      INSERT INTO leagues
        (name, organizer_user_id, players_per_pool, pool_count, recruit_start, recruit_end, description, category)
      VALUES (
        ${name}, ${organizer.user_id}, ${playersPerPool}, ${poolCount},
        ${body.recruit_start || null}, ${body.recruit_end || null},
        ${String(body.description || '').trim() || null},
        ${category}
      )
      RETURNING league_id, name, status, category
    `;
    return NextResponse.json({ league, organizer_user_name: organizer.user_name });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
