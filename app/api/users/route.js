import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { saveUpload } from '@/lib/storage';
import {
  normalizeUserId, isValidUserId, normalizeUserName, isValidUserName, USER_ID_PLACEHOLDER,
} from '@/lib/user-id';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

/** 登録が済んだらそのままログイン状態にする */
function withSession(payload, efootballUserId) {
  const res = NextResponse.json(payload);
  res.cookies.set(SESSION_COOKIE, efootballUserId, sessionCookieOptions());
  return res;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 詰まっても関数を長時間占有しないよう、上限を明示する
export const maxDuration = 15;

/** 公開情報のみ返す（ユーザーIDは絶対に返さない） */
export async function GET() {
  const users = await sql`
    SELECT user_id, user_name, photo_path FROM users ORDER BY user_id
  `;
  return NextResponse.json({ users });
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const userName = normalizeUserName(form.get('user_name'));
    const efootballUserId = normalizeUserId(form.get('efootball_user_id'));

    if (!userName) {
      return NextResponse.json({ error: 'ユーザー名を入力してください' }, { status: 400 });
    }
    if (!isValidUserName(userName)) {
      return NextResponse.json(
        { error: 'ユーザー名は2〜32文字で、スペースを含めずに入力してください' },
        { status: 400 }
      );
    }
    if (!isValidUserId(efootballUserId)) {
      return NextResponse.json(
        { error: `ユーザーIDの形式が違います（${USER_ID_PLACEHOLDER} のような形式です）` },
        { status: 400 }
      );
    }

    const [byId] = await sql`SELECT * FROM users WHERE efootball_user_id = ${efootballUserId}`;
    const [byName] = await sql`SELECT * FROM users WHERE user_name = ${userName}`;

    // 同じ組み合わせでの再登録は「ログイン」として扱う
    if (byId && byName && byId.user_id === byName.user_id) {
      return withSession(
        {
          user: { user_id: byId.user_id, user_name: byId.user_name, photo_path: byId.photo_path },
          existing: true,
        },
        efootballUserId
      );
    }
    if (byName) {
      return NextResponse.json(
        { error: 'このユーザー名は既に使われています。別の名前にしてください' },
        { status: 409 }
      );
    }
    if (byId) {
      return NextResponse.json(
        { error: 'このユーザーIDは既に別のユーザー名で登録されています' },
        { status: 409 }
      );
    }

    const photoPath = await saveUpload(form.get('photo'), 'user');
    const [user] = await sql`
      INSERT INTO users (user_name, efootball_user_id, photo_path)
      VALUES (${userName}, ${efootballUserId}, ${photoPath})
      RETURNING user_id, user_name, photo_path
    `;
    return withSession({ user, existing: false }, efootballUserId);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
