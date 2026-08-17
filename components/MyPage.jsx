'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import UserIdInput, { loadRememberedUserId, rememberUserId } from './UserIdInput';

const LEAGUE_STATUS = {
  recruiting: { text: '募集中', cls: 'bg-volt text-ink' },
  in_progress: { text: '開催中', cls: 'bg-white text-ink' },
  finished: { text: '終了', cls: 'bg-white/15 text-white/60' },
};

export default function MyPage() {
  const [userId, setUserId] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load(id = userId) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efootball_user_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
      rememberUserId(id);
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  // 前回のIDが残っていれば、そのまま開く
  useEffect(() => {
    const saved = loadRememberedUserId();
    if (saved) {
      setUserId(saved);
      load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <div className="card mt-10 p-6">
        <UserIdInput
          value={userId}
          onChange={setUserId}
          label="あなたのユーザーID"
          hint="登録したユーザーIDで、自分の状況をまとめて確認できます。"
        />
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <button
          onClick={() => load()}
          disabled={busy || !userId}
          className="btn-volt mt-5 w-full"
        >
          {busy ? '読み込み中…' : 'マイページを開く'}
        </button>
        <p className="mt-4 text-xs text-white/35">
          未登録の方は <Link href="/register" className="text-volt underline">ユーザー登録</Link> から。
        </p>
      </div>
    );
  }

  const { user, joined, organized, todos } = data;
  const urgent = todos.filter((t) => t.urgent);

  return (
    <div className="mt-10 space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {user.photo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photo_path} alt={user.user_name} className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/50">
              {String(user.user_name).slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="label">ようこそ</p>
            <p className="headline text-3xl text-chalk">{user.user_name}</p>
          </div>
        </div>
        <button onClick={() => load()} disabled={busy} className="btn-ghost !px-5 !py-2 text-xs">
          {busy ? '更新中…' : '最新に更新'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* ---------- 通知 ---------- */}
      <section>
        <h2 className="headline text-2xl text-chalk">
          やること
          {urgent.length > 0 && (
            <span className="ml-3 rounded-full bg-amber-400 px-3 py-1 align-middle text-[11px] font-black tracking-widest text-ink">
              {urgent.length}
            </span>
          )}
        </h2>

        {todos.length === 0 ? (
          <p className="card mt-4 p-8 text-center text-sm text-white/40">
            いまのところ、やることはありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {todos.map((t, i) => (
              <li
                key={i}
                className={`card flex flex-wrap items-center gap-4 p-5 ${
                  t.urgent ? '!border-amber-400/40 bg-amber-400/[0.04]' : ''
                }`}
              >
                <span className="text-xl">{ICONS[t.kind] ?? '・'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-chalk">{t.text}</p>
                  <p className="mt-1 truncate text-xs text-white/40">
                    {t.league_name}
                    {t.opponent && ` ・ グループ${t.pool} 第${t.round}節 ・ vs ${t.opponent}`}
                  </p>
                </div>
                <Link
                  href={t.match_id ? `/matches/${t.match_id}/report` : `/leagues/${t.league_id}`}
                  className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-bold tracking-widest transition ${
                    t.urgent ? 'bg-amber-400 text-ink' : 'border border-white/15 text-white/60 hover:text-volt'
                  }`}
                >
                  {ACTIONS[t.kind] ?? '開く'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 参加リーグ ---------- */}
      <section>
        <h2 className="headline text-2xl text-chalk">申し込んだリーグ</h2>
        {joined.length === 0 ? (
          <p className="card mt-4 p-8 text-center text-sm text-white/40">
            まだ参加しているリーグはありません。{' '}
            <Link href="/leagues" className="text-volt underline">募集を見る</Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {joined.map((l) => (
              <li key={l.league_id} className="card flex flex-wrap items-center gap-4 p-5">
                <StatusChip league={l} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-chalk">{l.name}</p>
                  <p className="truncate text-xs text-white/40">
                    {l.team_name}
                    {l.pool_label && ` ・ グループ${l.pool_label}`}
                    {l.status === 'recruiting'
                      ? ` ・ ${l.entry_count}/${l.capacity}人`
                      : l.match_count > 0 && ` ・ 消化 ${l.done_count}/${l.match_count}`}
                    {l.organizer_user_name && ` ・ 主催 ${l.organizer_user_name}`}
                  </p>
                  {l.cancelled && l.cancel_reason && (
                    <p className="mt-1 truncate text-xs text-amber-300">中止: {l.cancel_reason}</p>
                  )}
                </div>
                <Link href={`/leagues/${l.league_id}`} className="btn-ghost !px-4 !py-2 text-[11px]">
                  開く
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 主催リーグ ---------- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="headline text-2xl text-chalk">主催したリーグ</h2>
          <Link href="/leagues/new" className="btn-ghost !px-4 !py-2 text-[11px]">＋ 新しく主催する</Link>
        </div>
        {organized.length === 0 ? (
          <p className="card mt-4 p-8 text-center text-sm text-white/40">
            まだ主催したリーグはありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {organized.map((l) => (
              <li key={l.league_id} className="card flex flex-wrap items-center gap-4 p-5">
                <StatusChip league={l} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-chalk">{l.name}</p>
                  <p className="truncate text-xs text-white/40">
                    {l.status === 'recruiting'
                      ? `${l.entry_count}/${l.capacity}人が申込済み`
                      : `${l.entry_count}人 ・ 承認済み ${l.done_count}/${l.match_count} 試合`}
                  </p>
                </div>
                <Link href={`/leagues/${l.league_id}`} className="btn-ghost !px-4 !py-2 text-[11px]">
                  管理する
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ICONS = {
  approve: '✅',
  waiting_approval: '⏳',
  rejected: '↩️',
  play_home: '🏟',
  play_away: '🎮',
  finalize: '🏆',
  recruiting: '📣',
};

const ACTIONS = {
  approve: '承認する',
  waiting_approval: '確認',
  rejected: '登録し直す',
  play_home: '部屋を立てる',
  play_away: '確認する',
  finalize: '確定する',
  recruiting: '管理する',
};

function StatusChip({ league }) {
  const st = league.cancelled
    ? { text: '中止', cls: 'bg-amber-400 text-ink' }
    : LEAGUE_STATUS[league.status] ?? LEAGUE_STATUS.recruiting;
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black tracking-widest ${st.cls}`}>
      {st.text}
    </span>
  );
}
