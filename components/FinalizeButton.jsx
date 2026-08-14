'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** リーグの確定。主催者だけが実行できる */
export default function FinalizeButton({ leagueId, enabled, remaining, organizerEfootballId }) {
  const router = useRouter();
  const [efootballId, setEfootballId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('efootball_id');
      if (saved) setEfootballId(saved);
    } catch {}
  }, []);

  const isOrganizer =
    !!organizerEfootballId &&
    efootballId.trim().toLowerCase() === String(organizerEfootballId).toLowerCase();

  async function finalize() {
    if (!confirm('リーグを確定して終了します。よろしいですか？')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efootball_id: efootballId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '確定に失敗しました');
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <p className="wc-head mb-3">主催者メニュー</p>
      <input
        className="field text-center"
        value={efootballId}
        onChange={(e) => setEfootballId(e.target.value)}
        placeholder={`主催者の efootball ID（${organizerEfootballId ?? '未設定'}）`}
      />
      <button
        onClick={finalize}
        disabled={!enabled || busy || !efootballId}
        className="btn-volt mt-4 w-full !bg-gold"
      >
        {busy ? '処理中…' : '結果を確定してリーグを終了'}
      </button>
      <p className="mt-3 text-xs text-white/40">
        {enabled
          ? '全試合の結果がアウェイ承認まで完了しました。'
          : `未消化・承認待ちの試合が ${remaining} 試合あります。`}
        {efootballId && !isOrganizer && (
          <span className="mt-1 block text-amber-300">
            確定できるのは主催者（{organizerEfootballId ?? '未設定'}）だけです。
          </span>
        )}
      </p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
