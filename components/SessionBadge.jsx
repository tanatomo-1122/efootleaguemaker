'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from './SessionProvider';

/** ヘッダーの右端。今誰としてログインしているかと、切り替え口 */
export default function SessionBadge() {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <Link
        href="/register"
        className="rounded-full border border-volt/50 px-3 py-1.5 text-[11px] font-bold tracking-widest text-volt hover:bg-volt hover:text-ink"
      >
        ログイン
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/15 py-1 pl-1 pr-3 transition hover:border-volt/60"
      >
        {user.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photo_path} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-volt text-[9px] font-black text-ink">
            {String(user.user_name).slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="max-w-[7rem] truncate text-[11px] font-bold text-chalk">
          {user.user_name}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-carbon shadow-card">
            <Link
              href="/me"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-xs text-chalk hover:bg-white/5"
            >
              マイページ
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); logout(); }}
              className="block w-full px-4 py-3 text-left text-xs text-white/50 hover:bg-white/5 hover:text-amber-300"
            >
              ログアウト / 別の人に切り替え
            </button>
          </div>
        </>
      )}
    </div>
  );
}
