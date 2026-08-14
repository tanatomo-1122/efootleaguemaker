'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PhotoInput from './PhotoInput';

export default function RegisterForm() {
  const router = useRouter();
  const [efootballId, setEfootballId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('efootball_id', efootballId);
      fd.append('display_name', displayName);
      if (photo) fd.append('photo', photo);

      const res = await fetch('/api/users', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登録に失敗しました');

      // 次回以降の入力を省くため記憶しておく
      try { localStorage.setItem('efootball_id', data.user.efootball_id); } catch {}

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
          <label htmlFor="eid" className="text-sm font-bold text-chalk">
            efootball のユーザーID
          </label>
        </div>
        <input
          id="eid"
          className="field"
          value={efootballId}
          onChange={(e) => setEfootballId(e.target.value)}
          placeholder="例: TOMOYA_10"
          autoComplete="off"
          required
        />
        <p className="mt-2 text-xs text-white/35">ゲーム内で表示されるIDをそのまま入力してください。</p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="headline text-volt">2</span>
          <label className="text-sm font-bold text-chalk">
            プロフィール写真 <span className="text-white/30">(任意)</span>
          </label>
        </div>
        <PhotoInput onChange={setPhoto} hint="タップして画像を選ぶ" />
      </div>

      <div>
        <div className="mb-2 flex items-baseline gap-3">
          <span className="headline text-white/25">3</span>
          <label htmlFor="dn" className="text-sm font-bold text-chalk">
            表示名 <span className="text-white/30">(任意)</span>
          </label>
        </div>
        <input
          id="dn"
          className="field"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例: ともや"
        />
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
