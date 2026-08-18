'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PhotoInput from './PhotoInput';
import UserIdInput, { rememberUserId } from './UserIdInput';
import { USER_ID_PLACEHOLDER } from '@/lib/user-id';

export default function RegisterForm() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('user_name', userName);
      fd.append('efootball_user_id', userId);
      if (photo) fd.append('photo', photo);

      const res = await fetch('/api/users', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登録に失敗しました');

      // 次回以降の入力を省くため、この端末にだけ記憶しておく
      rememberUserId(userId);
      try { localStorage.setItem('user_name', data.user.user_name); } catch {}

      setMsg({
        type: 'ok',
        text: data.existing ? 'すでに登録済みでした。そのまま参加できます。' : '登録が完了しました。',
      });
      setTimeout(() => router.push('/leagues'), 900);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-8">
      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="headline text-volt">1</span>
          <label htmlFor="uname" className="text-sm font-bold text-chalk">
            ユーザー名
          </label>
        </div>
        <input
          id="uname"
          className="field"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="例: TOMOYA_10"
          autoComplete="off"
          required
        />
        <p className="mt-2 text-xs text-white/35">
          リーグ表や対戦カードに表示される名前です。他の人と同じ名前は使えません。
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="headline text-volt">2</span>
          <span className="text-sm font-bold text-chalk">ユーザーID</span>
        </div>
        <UserIdInput
          value={userId}
          onChange={setUserId}
          label="eFootball のユーザーID"
          autoFill={false}
          required
          hint={`${USER_ID_PLACEHOLDER} のような、eFootball のマイページに表示されているIDです。`}
        />
        <div className="mt-3 rounded-xl border border-volt/25 bg-volt/[0.05] p-4 text-xs leading-relaxed text-white/60">
          このIDは<span className="text-volt">パスワードの代わり</span>になります。
          試合結果の登録・承認や、リーグの確定はこのIDで本人確認します。
          リーグ表などに表示されることはありません。他の人には教えないでください。
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="headline text-white/25">3</span>
          <label className="text-sm font-bold text-chalk">
            プロフィール写真 <span className="text-white/30">(任意)</span>
          </label>
        </div>
        <PhotoInput onChange={setPhoto} hint="タップして画像を選ぶ" preset="avatar" />
      </div>

      {msg && (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-volt' : 'text-red-400'}`}>{msg.text}</p>
      )}

      <button className="btn-volt w-full" disabled={busy}>
        {busy ? '送信中…' : '登録する'}
      </button>
    </form>
  );
}
