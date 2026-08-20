'use client';

import { useState } from 'react';
import Link from 'next/link';
import UserIdInput from './UserIdInput';
import { useSession } from './SessionProvider';

/**
 * 「あなたは誰か」を扱う共通部品。
 *
 * ログイン済みなら入力欄は出さず、「◯◯ として操作します」とだけ表示する。
 * 未ログインのときだけユーザーIDを聞き、そのままログイン状態にする。
 *
 * これで 48 試合ぶんの ID 入力が 1 回で済む。
 *
 * @param {string}   expectedUserName この操作ができる人（違う人がログイン中なら注意を出す）
 * @param {string}   hint             未ログイン時の補足
 * @param {function} onReady          操作可能かどうかを親に伝える
 */
export default function IdentityGate({ expectedUserName, label, hint, onReady }) {
  const { user, login } = useSession();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [switching, setSwitching] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(value);
      setValue('');
      setSwitching(false);
      onReady?.(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // --- ログイン済み ---
  if (user && !switching) {
    const mismatch = expectedUserName && expectedUserName !== user.user_name;
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/55">
            <span className="font-bold text-chalk">{user.user_name}</span> として操作します
          </p>
          <button
            type="button"
            onClick={() => setSwitching(true)}
            className="text-[11px] text-white/35 underline hover:text-volt"
          >
            別の人に切り替える
          </button>
        </div>
        {mismatch && (
          <p className="mt-2 text-xs text-amber-300">
            この操作ができるのは {expectedUserName} さんです。
            自分のアカウントに切り替えてください。
          </p>
        )}
      </div>
    );
  }

  // --- 未ログイン / 切り替え中 ---
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <UserIdInput
        value={value}
        onChange={setValue}
        label={label ?? 'あなたのユーザーID'}
        autoFill={false}
        hint={hint ?? '一度入力すれば、次からは入力不要になります。'}
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !value}
          className="btn-volt flex-1 !py-2.5 text-sm"
        >
          {busy ? '確認中…' : switching ? '切り替える' : 'ログインする'}
        </button>
        {switching && (
          <button
            type="button"
            onClick={() => { setSwitching(false); setError(null); }}
            className="btn-ghost !px-4 !py-2.5 text-xs"
          >
            やめる
          </button>
        )}
      </div>
      {!switching && (
        <p className="mt-3 text-xs text-white/35">
          未登録の方は <Link href="/register" className="text-volt underline">ユーザー登録</Link> から。
        </p>
      )}
    </div>
  );
}
