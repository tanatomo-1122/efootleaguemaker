'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ログイン状態をアプリ全体で共有する。
 *
 * 実体は httpOnly Cookie なので、画面側はユーザーIDそのものを持たない。
 * ここで持つのは「誰としてログインしているか」という表示用の情報だけ。
 */

const SessionContext = createContext({ user: null, ready: false });

export function useSession() {
  return useContext(SessionContext);
}

const LEGACY_KEY = 'efootball_user_id';

export default function SessionProvider({ initialUser, children }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser ?? null);
  const [ready, setReady] = useState(true);

  // サーバー側で確定した値を正とする
  useEffect(() => {
    setUser(initialUser ?? null);
  }, [initialUser]);

  // 以前の版で localStorage に保存していた人を、そのままログイン状態へ移行する
  useEffect(() => {
    if (user) return;
    let saved = null;
    try { saved = localStorage.getItem(LEGACY_KEY); } catch {}
    if (!saved) return;

    setReady(false);
    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ efootball_user_id: saved }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          router.refresh();
        } else {
          try { localStorage.removeItem(LEGACY_KEY); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function login(efootballUserId) {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ efootball_user_id: efootballUserId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ログインに失敗しました');
    setUser(data.user);
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
    router.refresh();
    return data.user;
  }

  async function logout() {
    await fetch('/api/session', { method: 'DELETE' });
    setUser(null);
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
    router.refresh();
  }

  return (
    <SessionContext.Provider value={{ user, ready, login, logout, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}
