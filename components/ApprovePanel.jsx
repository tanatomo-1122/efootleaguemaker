'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdentityGate from './IdentityGate';
import { useSession } from './SessionProvider';
import { STAT_KEYS } from '@/lib/schema';

/** アウェイ側が、ホームの登録した結果を承認 / 差し戻しするパネル */
export default function ApprovePanel({
  matchId, leagueId, homeName, awayName, awayUserName, homeUserName,
  stats, imagePath, reportedAt,
}) {
  const router = useRouter();
  const { user } = useSession();
  const [note, setNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // 'approved' | 'rejected'

  async function send(action) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '処理に失敗しました');
      setDone(action === 'reject' ? 'rejected' : 'approved');
      setTimeout(() => {
        router.push(`/leagues/${leagueId}`);
        router.refresh();
      }, 1600);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mt-10 p-10 text-center">
        <p className={`headline text-3xl ${done === 'approved' ? 'text-volt' : 'text-amber-300'}`}>
          {done === 'approved' ? '承認しました' : '差し戻しました'}
        </p>
        <p className="mt-4 text-sm text-white/60">
          {done === 'approved'
            ? 'リーグ表と集計に反映されました。'
            : `${homeUserName} さんに登録し直してもらってください。`}
        </p>
      </div>
    );
  }

  const hs = stats.home_score;
  const as = stats.away_score;

  return (
    <div className="mt-10 space-y-8">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-5 text-sm">
        <p className="font-bold text-amber-300">アウェイの承認待ちです</p>
        <p className="mt-2 text-white/60">
          ホームの <span className="text-chalk">{homeUserName}</span> さんが結果を登録しました
          {reportedAt ? `（${reportedAt}）` : ''}。内容を確認して、アウェイの{' '}
          <span className="text-chalk">{awayUserName}</span> さんが承認してください。
          承認されるまでリーグ表には反映されません。
        </p>
      </div>

      {/* スコア */}
      <section className="card p-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
          <div className="min-w-0">
            <p className="label">HOME</p>
            <p className="mt-1 truncate text-sm text-chalk">{homeName}</p>
          </div>
          <p className="headline text-5xl text-volt">
            {hs} <span className="text-white/25">-</span> {as}
          </p>
          <div className="min-w-0">
            <p className="label">AWAY</p>
            <p className="mt-1 truncate text-sm text-chalk">{awayName}</p>
          </div>
        </div>

        <div className="mt-8 space-y-1.5">
          {STAT_KEYS.filter((s) => s.key !== 'score').map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
              <span className="text-right font-mono text-chalk/80">{fmt(stats[`home_${key}`])}</span>
              <span className="w-28 text-center text-[11px] text-white/40">{label}</span>
              <span className="text-left font-mono text-chalk/80">{fmt(stats[`away_${key}`])}</span>
            </div>
          ))}
        </div>

        {imagePath && (
          <div className="mt-8">
            <p className="label mb-2">ホームが送信した写真</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePath} alt="result" className="w-full rounded-xl border border-white/10" />
          </div>
        )}
      </section>

      {/* 承認 */}
      <section className="card p-6">
        <IdentityGate
          expectedUserName={awayUserName}
          hint={`承認できるのはアウェイ側の ${awayUserName} さんです。`}
        />

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          onClick={() => send('approve')}
          disabled={busy || !user}
          className="btn-volt mt-6 w-full"
        >
          {busy ? '送信中…' : 'この結果を承認する'}
        </button>

        {!showReject ? (
          <button
            type="button"
            onClick={() => setShowReject(true)}
            className="mt-4 w-full text-center text-xs text-white/40 underline hover:text-amber-300"
          >
            内容が違う場合はこちら（差し戻す）
          </button>
        ) : (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="label mb-2">差し戻しの理由（任意）</p>
            <textarea
              className="field h-20 resize-none"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: スコアが逆になっています"
            />
            <button
              type="button"
              onClick={() => send('reject')}
              disabled={busy || !user}
              className="btn-ghost mt-4 w-full !border-amber-400/50 !text-amber-300"
            >
              差し戻してホームに再登録を依頼する
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function fmt(v) {
  return v === null || v === undefined || v === '' ? '–' : v;
}
