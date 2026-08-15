'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UserIdInput, { rememberUserId } from './UserIdInput';

/**
 * 対戦部屋の受け渡し。
 *   ホーム: eFootball で部屋を立てて、その番号をここに貼る
 *   アウェイ: 自分のユーザーIDを入れて番号を確認する
 *
 * 部屋番号はサーバーから勝手に降ってこない。確認ボタンを押して初めて取りに行く。
 */
export default function RoomPanel({
  matchId, homeUserName, awayUserName, hasRoom, roomPostedAt,
}) {
  const router = useRouter();
  const [mode, setMode] = useState(null); // null | 'post' | 'reveal'
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function post(action) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          efootball_user_id: userId,
          room_code: code,
          room_note: note,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '共有に失敗しました');
      rememberUserId(userId);
      setMode(null);
      setCode('');
      setNote('');
      setMessage(
        action === 'clear'
          ? '部屋番号を取り消しました。'
          : `共有しました。${data.notify} さんが確認できます。`
      );
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/room/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efootball_user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '確認に失敗しました');
      rememberUserId(userId);
      setRevealed(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`card mt-10 p-6 ${hasRoom ? '!border-volt/40 bg-volt/[0.03]' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">対戦部屋</p>
        {hasRoom ? (
          <span className="rounded-full bg-volt px-3 py-1 text-[10px] font-black tracking-widest text-ink">
            部屋あり{roomPostedAt ? ` ・ ${roomPostedAt}` : ''}
          </span>
        ) : (
          <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold tracking-widest text-white/40">
            まだ立っていません
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-white/55">
        ホームの <span className="text-chalk">{homeUserName}</span> さんが eFootball で部屋を立てて、
        番号をここに貼ります。アウェイの <span className="text-chalk">{awayUserName}</span> さんは、
        自分のユーザーIDを入れると番号を確認できます。
      </p>

      {message && <p className="mt-4 text-sm text-volt">{message}</p>}

      {/* 確認結果 */}
      {revealed && (
        <div className="mt-5 rounded-xl border border-volt/40 bg-volt/[0.07] p-5 text-center">
          {revealed.has_room ? (
            <>
              <p className="label">部屋番号</p>
              <p className="headline mt-2 select-all text-4xl tracking-widest text-volt">
                {revealed.room_code}
              </p>
              {revealed.room_note && (
                <p className="mt-3 text-sm text-chalk/80">{revealed.room_note}</p>
              )}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(revealed.room_code)}
                className="mt-4 text-xs text-white/40 underline hover:text-volt"
              >
                コピーする
              </button>
            </>
          ) : (
            <p className="text-sm text-white/60">{revealed.message}</p>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {/* 操作 */}
      {mode === null && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => { setMode('reveal'); setRevealed(null); setError(null); }}
            className="btn-volt flex-1 !py-3 text-sm"
          >
            部屋番号を確認する
          </button>
          <button
            type="button"
            onClick={() => { setMode('post'); setError(null); setMessage(null); }}
            className="btn-ghost !px-5 !py-3 text-xs"
          >
            {hasRoom ? '番号を変える（ホーム）' : '部屋番号を貼る（ホーム）'}
          </button>
        </div>
      )}

      {mode === 'reveal' && (
        <div className="mt-5 space-y-4">
          <UserIdInput
            value={userId}
            onChange={setUserId}
            label="あなたのユーザーID"
            hint="この試合の対戦者だけが確認できます。"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reveal}
              disabled={busy || !userId}
              className="btn-volt flex-1 !py-3 text-sm"
            >
              {busy ? '確認中…' : '確認する'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-ghost !px-5 !py-3 text-xs">
              閉じる
            </button>
          </div>
        </div>
      )}

      {mode === 'post' && (
        <div className="mt-5 space-y-4">
          <UserIdInput
            value={userId}
            onChange={setUserId}
            label="ホームのユーザーID"
            hint={`部屋番号を貼れるのはホームの ${homeUserName} さんだけです。`}
          />
          <label className="block">
            <span className="label mb-2 block">部屋番号</span>
            <input
              className="field font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例: 123456"
              maxLength={40}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="label mb-2 block">ひとこと（任意）</span>
            <input
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: パスワードは 1234 / 22時まで待ってます"
              maxLength={100}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => post('post')}
              disabled={busy || !userId || !code.trim()}
              className="btn-volt flex-1 !py-3 text-sm"
            >
              {busy ? '送信中…' : '共有する'}
            </button>
            {hasRoom && (
              <button
                type="button"
                onClick={() => post('clear')}
                disabled={busy || !userId}
                className="btn-ghost !px-5 !py-3 text-xs !border-amber-400/50 !text-amber-300"
              >
                取り消す
              </button>
            )}
            <button type="button" onClick={() => setMode(null)} className="btn-ghost !px-5 !py-3 text-xs">
              閉じる
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
