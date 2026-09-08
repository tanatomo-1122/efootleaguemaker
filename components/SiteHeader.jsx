'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SessionBadge from './SessionBadge';

/**
 * サイト共通ヘッダー。
 *
 * PC   : ロゴ ＋ 全メニュー ＋ ログイン
 * スマホ: ロゴ ＋「募集中」＋ 三本線トグル ＋ ログインアイコン
 *         トグルを押すと EFLランク / 主催 / データ がドロワーで開く
 */

const DRAWER_MENU = [
  { href: '/rank', label: 'EFLランク', desc: '実力レーティング', accent: true },
  { href: '/leagues/new', label: '主催', desc: 'リーグを立ち上げる' },
  { href: '/data', label: 'データ', desc: 'みんなの統計' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 画面が変わったら閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 開いている間は背面をスクロールさせない
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 md:h-auto md:gap-3 md:px-5 md:py-4">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="headline shrink-0 text-base text-chalk md:text-xl"
        >
          efoot<span className="text-volt">league</span>maker
        </Link>

        {/* ---------- PC ---------- */}
        <div className="hidden items-center gap-3 md:flex">
          <nav className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest lg:gap-3">
            <DeskLink href="/leagues" active={pathname === '/leagues'}>募集中</DeskLink>
            <DeskLink href="/rank" active={pathname === '/rank'} accent>EFLランク</DeskLink>
            <DeskLink href="/leagues/new" active={pathname === '/leagues/new'}>主催</DeskLink>
            <DeskLink href="/data" active={pathname === '/data'}>データ</DeskLink>
          </nav>
          <SessionBadge />
        </div>

        {/* ---------- スマホ ---------- */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/leagues"
            className="rounded-full bg-volt px-3.5 py-2 text-[11px] font-black tracking-widest text-ink transition active:brightness-90"
          >
            募集中
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={open}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${
              open ? 'border-volt bg-volt/10 text-volt' : 'border-white/20 text-chalk'
            }`}
          >
            <Burger open={open} />
          </button>

          <SessionBadge compact />
        </div>
      </div>

      {/* ---------- スマホ用ドロワー ---------- */}
      {open && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-14 z-40 cursor-default bg-ink/70 backdrop-blur-sm"
          />
          <nav className="menu-panel relative z-50 border-t border-white/10 bg-carbon px-4 pb-6 pt-3 shadow-card">
            <ul className="space-y-1.5">
              {DRAWER_MENU.map((m) => (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 transition active:bg-white/10 ${
                      pathname === m.href
                        ? 'bg-white/[0.08] ring-1 ring-inset ring-white/10'
                        : 'bg-white/[0.03]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block text-base font-bold ${m.accent ? 'text-gold' : 'text-chalk'}`}
                      >
                        {m.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/35">{m.desc}</span>
                    </span>
                    <span className="shrink-0 text-lg leading-none text-white/25">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}

/* ---------------- 部品 ---------------- */

function DeskLink({ href, active, accent, children }) {
  return (
    <Link
      href={href}
      className={`px-2 py-1 transition ${
        accent
          ? `text-gold hover:brightness-125 ${active ? 'brightness-125' : ''}`
          : active
            ? 'text-volt'
            : 'text-white/60 hover:text-volt'
      }`}
    >
      {children}
    </Link>
  );
}

/** 三本線 ⇄ ✕ */
function Burger({ open }) {
  const bar = 'absolute left-0 block h-[2px] w-5 rounded bg-current transition-all duration-200';
  return (
    <span className="relative block h-[14px] w-5" aria-hidden="true">
      <span className={`${bar} ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
      <span className={`${bar} top-1.5 ${open ? 'opacity-0' : 'opacity-100'}`} />
      <span className={`${bar} ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
    </span>
  );
}
