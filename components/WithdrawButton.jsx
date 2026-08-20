'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdentityGate from './IdentityGate';
import { useSession } from './SessionProvider';

/** 参加取り消し（組み合わせ抽選の前だけ） */
export default function WithdrawButton({ leagueId }) {
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function withdraw() {
    if (!confirm('このリーグへの参加を取り消します。よろしいですか？')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/entries`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取り消しに失敗しました');
      setDone(data.team_name);
      setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-8 text-center text-sm text-volt">
        「{done}」の参加を取り消しました。
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-8 text-xs text-white/35 underline hover:text-amber-300"
      >
        参加を取り消す
      </button>
    );
  }

  return (
    <div className="card mx-auto mt-8 max-w-md p-6 text-left">
      <p className="label mb-4">参加取り消し</p>
      <IdentityGate hint="登録したスカッドも一緒に削除されます。" />
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={withdraw}
          disabled={busy || !user}
          className="btn-ghost flex-1 !border-amber-400/50 !text-amber-300"
        >
          {busy ? '処理中…' : '取り消す'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !px-5">
          やめる
        </button>
      </div>
    </div>
  );
}
