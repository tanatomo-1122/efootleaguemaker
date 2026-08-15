'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UserIdInput, { rememberUserId } from './UserIdInput';

/** リーグの確定。主催者だけが実行できる（ユーザーIDで本人確認） */
export default function FinalizeButton({ leagueId, enabled, remaining, organizerUserName }) {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function finalize() {
    if (!confirm('リーグを確定して終了します。よろしいですか？')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efootball_user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '確定に失敗しました');
      rememberUserId(userId);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md text-left">
      <p className="wc-head mb-3 text-center">主催者メニュー</p>
      <UserIdInput
        value={userId}
        onChange={setUserId}
        label="主催者のユーザーID"
        hint={`確定できるのは主催者の ${organizerUserName ?? '（未設定）'} さんだけです。`}
      />
      <button
        onClick={finalize}
        disabled={!enabled || busy || !userId}
        className="btn-volt mt-4 w-full !bg-gold"
      >
        {busy ? '処理中…' : '結果を確定してリーグを終了'}
      </button>
      <p className="mt-3 text-center text-xs text-white/40">
        {enabled
          ? '全試合の結果がアウェイ承認まで完了しました。'
          : `未消化・承認待ちの試合が ${remaining} 試合あります。`}
      </p>
      {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
