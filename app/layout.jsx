import './globals.css';
import SessionProvider from '@/components/SessionProvider';
import SiteHeader from '@/components/SiteHeader';
import { getSessionUser } from '@/lib/session';

export const metadata = {
  title: 'efootleaguemaker',
  description: 'eFootball のリーグ戦を作って、遊んで、データを残す。',
};

// スマホで意図しない拡大・横スクロールが起きないようにする
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#050505',
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
          <SiteHeader />
          <main className="min-h-[70vh]">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 px-5 py-8 text-center text-xs text-white/30 sm:mt-24 sm:py-10">
      efootleaguemaker
    </footer>
  );
}
