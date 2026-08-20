'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdentityGate from './IdentityGate';
import { useSession } from './SessionProvider';

/** リーグの中止 / 再開（主催者のみ） */
export default function CancelLeagueButton({ leagueId, organizerUserName, cancelled }) {
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const action = cancelled ? 'resume' : 'cancel';
  const actionLabel = cancelled ? '再開' : '中止';

  async function run() {
    if (
      !cancelled &&
      !confirm('このリーグを中止します。募集一覧から見えなくなります。よろしいですか？')
    ) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${actionLabel}に失敗しました`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-6 text-xs underline ${
          cancelled ? 'text-volt hover:text-volt' : 'text-white/35 hover:text-amber-300'
        }`}
      >
        {cancelled ? 'このリーグを再開する（主催者）' : 'このリーグを中止する（主催者）'}
      </button>
    );
  }

  return (
    <div className="card mx-auto mt-6 max-w-md p-6 text-left">
      <p className="label mb-4">リーグの{actionLabel}</p>
      <IdentityGate
        expectedUserName={organizerUserName}
        hint={`${actionLabel}できるのは主催者の ${organizerUserName ?? '（未設定）'} さんだけです。`}
      />

      {!cancelled && (
        <div className="mt-5">
          <p className="label mb-2">中止の理由（任意）</p>
          <textarea
            className="field h-20 resize-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 人数が集まらなかったため"
          />
          <p className="mt-2 text-xs text-white/35">
            中止しても記録は消えません。募集一覧から隠れ、申し込みや結果の登録ができなくなります。
            あとから再開もできます。
          </p>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy || !user}
          className={`btn-ghost flex-1 ${
            cancelled ? '!border-volt/50 !text-volt' : '!border-amber-400/50 !text-amber-300'
          }`}
        >
          {busy ? '処理中…' : `リーグを${actionLabel}する`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !px-5">
          やめる
        </button>
      </div>
    </div>
  );
}
