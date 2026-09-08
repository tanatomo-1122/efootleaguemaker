'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from './SessionProvider';

/**
 * ヘッダーの右端。今誰としてログインしているかと、切り替え口。
 * compact = スマホ用（アイコンだけ／名前を出さない）
 */
export default function SessionBadge({ compact = false }) {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);

  if (!user) {
    if (compact) {
      return (
        <Link
          href="/register"
          aria-label="ログイン"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-volt/60 text-volt transition active:bg-volt/20"
        >
          <UserIcon />
        </Link>
      );
    }
    return (
      <Link
        href="/register"
        className="rounded-full border border-volt/50 px-3 py-1.5 text-[11px] font-bold tracking-widest text-volt hover:bg-volt hover:text-ink"
      >
        ログイン
      </Link>
    );
  }

  const initials = String(user.user_name).slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={compact ? `${user.user_name} のメニュー` : undefined}
        aria-expanded={open}
        className={
          compact
            ? `grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border transition ${
                open ? 'border-volt' : 'border-white/20'
              }`
            : 'flex items-center gap-2 rounded-full border border-white/15 py-1 pl-1 pr-3 transition hover:border-volt/60'
        }
      >
        {user.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photo_path}
            alt=""
            className={compact ? 'h-full w-full object-cover' : 'h-6 w-6 rounded-full object-cover'}
          />
        ) : (
          <span
            className={
              compact
                ? 'flex h-full w-full items-center justify-center bg-volt text-[11px] font-black text-ink'
                : 'flex h-6 w-6 items-center justify-center rounded-full bg-volt text-[9px] font-black text-ink'
            }
          >
            {initials}
          </span>
        )}
        {!compact && (
          <span className="max-w-[7rem] truncate text-[11px] font-bold text-chalk">
            {user.user_name}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-carbon shadow-card">
            <p className="truncate border-b border-white/10 px-4 py-3 text-[11px] text-white/40">
              {user.user_name}
            </p>
            <Link
              href="/me"
              onClick={() => setOpen(false)}
              className="block px-4 py-3.5 text-sm text-chalk hover:bg-white/5"
            >
              マイページ
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); logout(); }}
              className="block w-full px-4 py-3.5 text-left text-sm text-white/50 hover:bg-white/5 hover:text-amber-300"
            >
              ログアウト / 別の人に切り替え
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" strokeLinecap="round" />
    </svg>
  );
}
