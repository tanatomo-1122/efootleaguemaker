'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UserIdInput, { rememberUserId } from './UserIdInput';

/**
 * 募集中のリーグに対する主催者メニュー。
 *   - 今の人数で始める
 *   - 募集人数（プール数 / 1プールの人数）を変える
 */
export default function OrganizerPanel({
  leagueId, organizerUserName, entryCount, playersPerPool, poolCount,
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [players, setPlayers] = useState(playersPerPool);
  const [pools, setPools] = useState(poolCount);
  const [busy, setBusy] = useState(null); // 'start' | 'resize'
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const capacity = Number(players) * Number(pools);
  const canStart = entryCount >= 2;

  async function run(action) {
    if (
      action === 'start' &&
      !confirm(`今いる${entryCount}人でリーグを開始します。以降は参加できなくなります。よろしいですか？`)
    ) return;

    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          efootball_user_id: userId,
          action,
          players_per_pool: Number(players),
          pool_count: Number(pools),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作に失敗しました');
      rememberUserId(userId);

      if (action === 'start') {
        setMessage(
          `${data.players}人・${data.pool_count}グループ（${data.pool_sizes.join(' / ')}人）で開始しました。`
        );
      } else {
        setMessage(
          data.drawn
            ? '定員に達したため、そのまま組み合わせを抽選しました。'
            : `募集人数を${data.capacity}人に変更しました（現在${data.entries}人）。`
        );
      }
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 text-xs text-white/35 underline hover:text-volt"
      >
        主催者メニュー（開始・募集人数の変更）
      </button>
    );
  }

  return (
    <div className="card mx-auto mt-6 max-w-md p-6 text-left">
      <div className="mb-4 flex items-center justify-between">
        <p className="label">主催者メニュー</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-white/35 hover:text-volt">
          閉じる
        </button>
      </div>

      <UserIdInput
        value={userId}
        onChange={setUserId}
        label="主催者のユーザーID"
        hint={`操作できるのは主催者の ${organizerUserName ?? '（未設定）'} さんだけです。`}
      />

      {message && <p className="mt-4 text-sm text-volt">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {/* 今の人数で始める */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-bold text-chalk">今の人数で始める</p>
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          定員に届いていなくても、今いる <span className="text-chalk">{entryCount}人</span> で
          組み合わせを抽選して開始します。人数に合わせてグループ数は自動で調整されます
          （1グループ2人未満にはなりません）。
        </p>
        <button
          type="button"
          onClick={() => run('start')}
          disabled={busy !== null || !userId || !canStart}
          className="btn-volt mt-4 w-full !py-3 text-sm"
        >
          {busy === 'start' ? '開始中…' : `${entryCount}人でリーグを始める`}
        </button>
        {!canStart && (
          <p className="mt-2 text-xs text-amber-300">開始するには2人以上の参加が必要です。</p>
        )}
      </div>

      {/* 募集人数の変更 */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-bold text-chalk">募集人数を変える</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label mb-2 block">1グループの人数</span>
            <select className="field" value={players} onChange={(e) => setPlayers(e.target.value)}>
              {[2, 3, 4, 5, 6, 7, 8, 10, 12, 16].map((n) => (
                <option key={n} value={n}>{n} 人</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-2 block">グループ数</span>
            <select className="field" value={pools} onChange={(e) => setPools(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-white/45">
          定員 <span className="font-display text-base text-volt">{capacity}</span> 人
          （現在 {entryCount} 人）
          {capacity < entryCount && (
            <span className="mt-1 block text-amber-300">
              申込済みの人数より少なくはできません。
            </span>
          )}
          {capacity === entryCount && (
            <span className="mt-1 block text-volt">
              この人数にすると定員ちょうどになり、そのまま抽選まで進みます。
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => run('resize')}
          disabled={busy !== null || !userId || capacity < entryCount}
          className="btn-ghost mt-4 w-full !py-3 text-xs"
        >
          {busy === 'resize' ? '変更中…' : '募集人数を変更する'}
        </button>
      </div>
    </div>
  );
}
