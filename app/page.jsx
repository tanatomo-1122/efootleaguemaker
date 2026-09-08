import Link from 'next/link';
import { listLeagues } from '@/lib/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export default async function HomePage() {
  const leagues = await listLeagues();
  const open = leagues.filter((l) => l.status === 'recruiting').length;
  const running = leagues.filter((l) => l.status === 'in_progress').length;

  return (
    <div>
      {/* ---------- ヒーロー ---------- */}
      <section className="slash-bg relative overflow-hidden border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-5 sm:py-32">
          <p className="label mb-6">eFootball League Platform</p>
          <h1 className="headline text-[15vw] leading-[0.8] text-chalk sm:text-[110px]">
            みんなで
            <br />
            <span className="text-volt">リーグを</span>
            <br />
            つくる。
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-white/60 sm:mt-8">
            スカッドを登録して、抽選でプールが決まって、結果の写真を送るだけ。
            リーグ表は自動で更新されます。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap">
            <Link href="/leagues" className="btn-volt w-full sm:w-auto">募集中のリーグを見る</Link>
            <Link href="/register" className="btn-ghost w-full sm:w-auto">ユーザー登録</Link>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-3 border-t border-white/10 pt-8 sm:mt-16 sm:flex sm:gap-10">
            <Stat n={open} label="募集中" />
            <Stat n={running} label="開催中" />
            <Stat n={leagues.length} label="累計リーグ" />
          </div>
        </div>
      </section>

      {/* ---------- 3ステップ ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-5 sm:py-20">
        <h2 className="headline mb-8 text-3xl text-chalk sm:mb-10 sm:text-4xl">参加は3ステップ</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Step n="01" title="ユーザー登録" body="efootball ID と写真を登録するだけ。" href="/register" cta="登録する" />
          <Step n="02" title="申し込み & スカッド登録" body="攻撃時/守備時フォーメーション、チームパワー、スタイルを提出。" href="/leagues" cta="リーグを探す" />
          <Step n="03" title="試合して写真を送る" body="ホームが結果を登録、アウェイが承認するとリーグ表へ反映。" href="/leagues" cta="進行中を見る" />
        </div>
      </section>


    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div className="headline text-4xl text-volt sm:text-5xl">{String(n).padStart(2, '0')}</div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}

function Step({ n, title, body, href, cta }) {
  return (
    <div className="card group relative overflow-hidden p-6 sm:p-7">
      <div className="headline absolute -right-2 -top-4 text-7xl text-white/5">{n}</div>
      <h3 className="text-lg font-bold text-chalk">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-white/55">{body}</p>
      <Link href={href} className="mt-6 inline-block text-xs font-bold uppercase tracking-widest text-volt">
        {cta} →
      </Link>
    </div>
  );
}
