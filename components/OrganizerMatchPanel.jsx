'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UserIdInput, { rememberUserId } from './UserIdInput';
import { STAT_KEYS } from '@/lib/schema';

/**
 * 相手が音信不通で試合が進まないときに、主催者が代わりに処理するパネル。
 *
 * スコアだけで確定できるので、不戦勝の記録にも使える。
 * 誰がやったかは必ず記録され、画面にも「主催者が代理で確定」と出る。
 */
export default function OrganizerMatchPanel({
  matchId, leagueId, organizerUserName, homeName, awayName,
  homeUserName, awayUserName, matchStatus, initialStats,
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [home, setHome] = useState(initialStats?.home_score ?? '');
  const [away, setAway] = useState(initialStats?.away_score ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function run(action, stats) {
    const confirmText = {
      settle: '主催者として結果を確定します。相手の承認は不要になります。よろしいですか？',
      approve: '承認待ちの結果を、主催者として代理で承認します。よろしいですか？',
      reset: '確定済みの結果を取り消して、未消化に戻します。よろしいですか？',
    }[action];
    if (!confirm(confirmText)) return;

    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/organizer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efootball_user_id: userId, action, stats, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作に失敗しました');
      rememberUserId(userId);
      setMessage(
        action === 'reset'
          ? '結果を取り消しました。未消化に戻っています。'
          : '確定しました。リーグ表に反映されています。'
      );
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function settle(h, a, defaultNote) {
    const stats = { ...(initialStats || {}), home_score: h, away_score: a };
    if (!note && defaultNote) setNote(defaultNote);
    return run('settle', stats);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 w-full text-center text-xs text-white/35 underline hover:text-amber-300"
      >
        相手が反応しない場合はこちら（主催者が代理で処理）
      </button>
    );
  }

  return (
    <section className="card mt-6 !border-amber-400/30 bg-amber-400/[0.03] p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="label !text-amber-300/80">主催者による代理処理</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-white/35 hover:text-volt">
          閉じる
        </button>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-white/50">
        相手が音信不通で試合が進まないときに、主催者が代わりに結果を確定できます。
        <span className="text-amber-300">誰が代理で処理したかは記録され、試合ページに表示されます。</span>
      </p>

      <UserIdInput
        value={userId}
        onChange={setUserId}
        label="主催者のユーザーID"
        hint={`代理で操作できるのは主催者の ${organizerUserName ?? '（未設定）'} さんだけです。`}
      />

      {message && <p className="mt-4 text-sm text-volt">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {/* 承認待ちなら代理承認 */}
      {matchStatus === 'pending' && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-bold text-chalk">代理で承認する</p>
          <p className="mt-2 text-xs text-white/45">
            ホームが登録した内容のまま確定します。
            {awayUserName} さんが承認できない状態のときに使ってください。
          </p>
          <button
            type="button"
            onClick={() => run('approve')}
            disabled={busy !== null || !userId}
            className="btn-volt mt-4 w-full !py-3 text-sm"
          >
            {busy === 'approve' ? '処理中…' : `${awayUserName} さんの代わりに承認する`}
          </button>
        </div>
      )}

      {/* 不戦勝 */}
      {matchStatus !== 'reported' && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-bold text-chalk">不戦勝として処理する</p>
          <p className="mt-2 text-xs text-white/45">
            片方が最後まで現れなかった場合に、3-0 で記録します。スクリーンショットは不要です。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => settle(3, 0, `${homeUserName} の不戦勝`)}
              disabled={busy !== null || !userId}
              className="btn-ghost !py-3 text-xs"
            >
              {homeName} の勝ち（3-0）
            </button>
            <button
              type="button"
              onClick={() => settle(0, 3, `${awayUserName} の不戦勝`)}
              disabled={busy !== null || !userId}
              className="btn-ghost !py-3 text-xs"
            >
              {awayName} の勝ち（0-3）
            </button>
          </div>
          <button
            type="button"
            onClick={() => settle(0, 0, '両者不参加のため引き分け扱い')}
            disabled={busy !== null || !userId}
            className="mt-3 w-full text-center text-xs text-white/35 underline hover:text-volt"
          >
            両者不参加として 0-0 で処理する
          </button>
        </div>
      )}

      {/* スコアを指定して確定 */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-bold text-chalk">スコアを指定して確定する</p>
        <p className="mt-2 text-xs text-white/45">
          対戦は済んだのに登録されない場合に、聞き取ったスコアで確定します。
        </p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div>
            <p className="mb-1 truncate text-[11px] text-white/45">{homeName}</p>
            <input
              type="number"
              className="field !py-2 text-center font-display text-lg"
              value={home}
              onChange={(e) => setHome(e.target.value)}
            />
          </div>
          <span className="pt-5 text-white/25">-</span>
          <div>
            <p className="mb-1 truncate text-[11px] text-white/45">{awayName}</p>
            <input
              type="number"
              className="field !py-2 text-center font-display text-lg"
              value={away}
              onChange={(e) => setAway(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => settle(home, away)}
          disabled={busy !== null || !userId || home === '' || away === ''}
          className="btn-volt mt-4 w-full !py-3 text-sm"
        >
          {busy === 'settle' ? '確定中…' : 'このスコアで確定する'}
        </button>
      </div>

      {/* メモ */}
      <div className="mt-4">
        <p className="label mb-2">記録に残すメモ（任意）</p>
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例: 相手が3日間連絡つかず、本人合意のうえで処理"
          maxLength={200}
        />
      </div>

      {/* 取り消し */}
      {matchStatus === 'reported' && (
        <button
          type="button"
          onClick={() => run('reset')}
          disabled={busy !== null || !userId}
          className="mt-5 w-full text-center text-xs text-amber-300/70 underline hover:text-amber-300"
        >
          {busy === 'reset' ? '処理中…' : 'この結果を取り消して未消化に戻す'}
        </button>
      )}
    </section>
  );
}
