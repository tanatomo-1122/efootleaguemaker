import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { saveUpload } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const users = await sql`
    SELECT user_id, efootball_id, display_name, photo_path FROM users ORDER BY user_id
  `;
  return NextResponse.json({ users });
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const efootballId = String(form.get('efootball_id') || '').trim();
    const displayName = String(form.get('display_name') || '').trim() || null;

    if (!efootballId) {
      return NextResponse.json({ error: 'efootball ID を入力してください' }, { status: 400 });
    }

    const [exists] = await sql`SELECT * FROM users WHERE efootball_id = ${efootballId}`;
    if (exists) {
      // 同じ ID なら再登録ではなくログイン扱い
      return NextResponse.json({ user: exists, existing: true });
    }

    const photoPath = await saveUpload(form.get('photo'), 'user');
    const [user] = await sql`
      INSERT INTO users (efootball_id, display_name, photo_path)
      VALUES (${efootballId}, ${displayName}, ${photoPath})
      RETURNING *
    `;
    return NextResponse.json({ user, existing: false });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
