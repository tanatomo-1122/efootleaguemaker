import './globals.css';
import Link from 'next/link';
import SessionProvider from '@/components/SessionProvider';
import SessionBadge from '@/components/SessionBadge';
import { getSessionUser } from '@/lib/session';

export const metadata = {
  title: 'efootleaguemaker',
  description: 'eFootball のリーグ戦を作って、遊んで、データを残す。',
};

export default async function RootLayout({ children }) {
  // Cookie から「誰としてログインしているか」を取り出して全画面へ配る
  const user = await getSessionUser();

  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;600;800&family=Noto+Sans+JP:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <SessionProvider initialUser={user}>
          <Header />
          <main className="min-h-[70vh]">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="headline shrink-0 text-xl text-chalk">
          efoot<span className="text-volt">league</span>maker
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest sm:gap-3 sm:text-xs">
            <Link href="/leagues" className="px-2 py-1 text-white/60 hover:text-volt">募集中</Link>
            <Link href="/leagues/new" className="px-2 py-1 text-white/60 hover:text-volt">主催</Link>
            <Link href="/data" className="px-2 py-1 text-white/60 hover:text-volt">データ</Link>
          </nav>
          <SessionBadge />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10 px-5 py-10 text-center text-xs text-white/30">
      efootleaguemaker
    </footer>
  );
}
