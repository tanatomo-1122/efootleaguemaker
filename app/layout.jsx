import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'efootleaguemaker',
  description: 'eFootball のリーグ戦を作って、遊んで、データを残す。',
};

export default function RootLayout({ children }) {
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
        <Header />
        <main className="min-h-[70vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="headline text-xl text-chalk">
          efoot<span className="text-volt">league</span>maker
        </Link>
        <nav className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest sm:gap-4 sm:text-xs">
          <Link href="/leagues" className="px-2 py-1 text-white/60 hover:text-volt">募集中</Link>
          <Link href="/register" className="px-2 py-1 text-white/60 hover:text-volt">登録</Link>
          <Link href="/leagues/new" className="px-2 py-1 text-white/60 hover:text-volt">主催</Link>
          <Link href="/data" className="px-2 py-1 text-white/60 hover:text-volt">データ</Link>
        </nav>
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
