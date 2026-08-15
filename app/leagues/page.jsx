import Link from 'next/link';
import { listLeagues, listEntries } from '@/lib/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: '試合募集 | efootleaguemaker' };

const STATUS = {
  recruiting: { text: '募集中', cls: 'bg-volt text-ink' },
  in_progress: { text: '開催中', cls: 'bg-white text-ink' },
  finished: { text: '終了', cls: 'bg-white/15 text-white/60' },
};

export default async function LeaguesPage() {
  const leagues = await listLeagues();

  return (
    <div>
      {/* 流れるヘッドライン */}
      <div className="overflow-hidden border-b border-white/10 bg-volt py-2">
        <div className="marquee flex w-max gap-8 whitespace-nowrap">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="headline text-sm text-ink">
              JOIN THE LEAGUE ✦ 募集中 ✦ ENTRY OPEN ✦
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label mb-3">Open Fixtures</p>
            <h1 className="headline text-6xl text-chalk sm:text-7xl">試合募集</h1>
          </div>
          <Link href="/leagues/new" className="btn-ghost">＋ リーグを主催する</Link>
        </div>

        {leagues.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {leagues.map((l) => (
              <LeagueCard key={l.league_id} league={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function LeagueCard({ league }) {
  const entries = await listEntries(league.league_id);
  const capacity = league.players_per_pool * league.pool_count;
  const filled = entries.length;
  const pct = Math.min(100, Math.round((filled / capacity) * 100));
  const st = STATUS[league.status] ?? STATUS.recruiting;
  const isOpen = league.status === 'recruiting';

  return (
    <article className="card slash-bg group relative overflow-hidden p-7 transition hover:border-volt/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${st.cls}`}>
            {st.text}
          </span>
          <h2 className="headline mt-4 truncate text-3xl text-chalk">{league.name}</h2>
          {league.organizer_user_name && (
            <p className="mt-1 truncate text-xs text-white/35">
              主催: {league.organizer_user_name}
            </p>
          )}
          {league.description && (
            <p className="mt-2 line-clamp-2 text-sm text-white/45">{league.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="headline text-5xl text-volt">
            {filled}
            <span className="text-2xl text-white/25">/{capacity}</span>
          </div>
          <div className="label mt-1">エントリー</div>
        </div>
      </div>

      {/* 定員ゲージ */}
      <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-volt transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-white/35">
        {isOpen
          ? `あと ${capacity - filled} 人で自動締切 → 組み合わせ抽選`
          : '締切済み・組み合わせ確定'}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-center">
        <Meta label="1プール" value={`${league.players_per_pool}人`} />
        <Meta label="プール数" value={`${league.pool_count}`} />
        <Meta label="総試合数" value={`${totalMatches(league)}`} />
      </dl>

      {(league.recruit_start || league.recruit_end) && (
        <p className="mt-4 font-mono text-[11px] text-white/35">
          募集: {league.recruit_start || '—'} 〜 {league.recruit_end || '—'}
        </p>
      )}

      {/* 参加者アイコン */}
      {filled > 0 && (
        <div className="mt-5 flex -space-x-2">
          {entries.slice(0, 10).map((e) =>
            e.user_photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={e.entry_id}
                src={e.user_photo}
                alt={e.user_name}
                title={e.user_name}
                className="h-8 w-8 rounded-full border-2 border-carbon object-cover"
              />
            ) : (
              <span
                key={e.entry_id}
                title={e.user_name}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-carbon bg-steel text-[10px] font-bold text-white/60"
              >
                {String(e.user_name).slice(0, 2).toUpperCase()}
              </span>
            )
          )}
          {filled > 10 && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-carbon bg-volt text-[10px] font-black text-ink">
              +{filled - 10}
            </span>
          )}
        </div>
      )}

      <div className="mt-7 flex gap-3">
        {isOpen ? (
          <Link href={`/leagues/${league.league_id}/join`} className="btn-volt flex-1 !py-3 text-sm">
            エントリーする
          </Link>
        ) : (
          <Link href={`/leagues/${league.league_id}`} className="btn-volt flex-1 !py-3 text-sm">
            リーグ表を見る
          </Link>
        )}
        <Link href={`/leagues/${league.league_id}`} className="btn-ghost !px-5 !py-3 text-xs">
          詳細
        </Link>
      </div>
    </article>
  );
}

function totalMatches(l) {
  const n = l.players_per_pool;
  return ((n * (n - 1)) / 2) * l.pool_count;
}

function Meta({ label, value }) {
  return (
    <div>
      <dd className="font-display text-xl text-chalk">{value}</dd>
      <dt className="label mt-1">{label}</dt>
    </div>
  );
}

function Empty() {
  return (
    <div className="card p-16 text-center">
      <p className="headline text-3xl text-white/25">まだ募集がありません</p>
      <p className="mt-4 text-sm text-white/40">最初のリーグを立ち上げてみましょう。</p>
      <Link href="/leagues/new" className="btn-volt mt-8">リーグを作成する</Link>
    </div>
  );
}
