import Link from 'next/link';
import { listRanking, listUnrated, CATEGORIES, INITIAL_RATING, TIERS } from '@/lib/rating';
import Presence from '@/components/Presence';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;
export const metadata = { title: 'EFLランク | efootleaguemaker' };

export default async function RankPage() {
  const ranking = await listRanking();
  const unrated = await listUnrated();

  const top = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <div className="pitch-stripes bg-gradient-to-b from-pitchdark via-ink to-ink">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <p className="wc-head">World Ranking</p>
        <h1 className="trophy-glow mt-3 font-display text-6xl uppercase italic text-gold sm:text-7xl">
          EFL Rank
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55">
          リーグ戦の全結果から算出した実力レーティングです。
          強い相手に勝つほど大きく上がり、格上に負けても下がりにくい仕組みになっています。
          全員 {INITIAL_RATING} からのスタートです。
        </p>

        {ranking.length === 0 ? (
          <p className="card mt-10 p-14 text-center text-sm text-white/40">
            まだ集計できる試合がありません。リーグ戦が承認されるとここに載ります。
          </p>
        ) : (
          <>
            {/* ---------- 表彰台 ---------- */}
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {top.map((r) => (
                <Podium key={r.user_id} r={r} />
              ))}
            </div>

            {/* ---------- 4位以下 ---------- */}
            {rest.length > 0 && (
              <div className="wc-panel mt-6 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-chalk/40">
                        <th className="px-4 py-3 text-left font-medium">#</th>
                        <th className="px-2 py-3 text-left font-medium">Player</th>
                        <th className="px-2 py-3 text-left font-medium">Tier</th>
                        <th className="px-2 py-3 text-right font-medium">試合</th>
                        <th className="px-2 py-3 text-right font-medium">直近</th>
                        <th className="px-4 py-3 text-right font-bold text-gold">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rest.map((r) => (
                        <tr key={r.user_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                          <td className="px-4 py-3 font-display text-white/40">{r.rank}</td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar src={r.photo_path} name={r.user_name} />
                              <div className="min-w-0">
                                <p className="truncate font-bold text-chalk">{r.user_name}</p>
                                <Presence lastSeenAt={r.last_seen_at} />
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <TierBadge tier={r.tier} />
                          </td>
                          <td className="px-2 py-3 text-right font-mono text-white/50">
                            {r.rating_matches}
                          </td>
                          <td className="px-2 py-3 text-right">
                            <Delta value={r.last_delta} />
                          </td>
                          <td className="px-4 py-3 text-right font-display text-xl text-gold">
                            {Math.round(r.rating)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------- 仕組みの説明 ---------- */}
        <section className="card mt-12 p-8">
          <p className="label mb-4">EFLランクの決まり方</p>
          <p className="font-mono text-sm text-volt">P = P_before + I × (W − We)</p>
          <p className="mt-2 font-mono text-xs text-white/40">
            We = 1 / (10^(−dr / 600) + 1)　　dr = 自分のレート − 相手のレート
          </p>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="label mb-2">W（試合結果）</p>
              <p className="text-sm text-white/55">勝ち 1 ／ 引き分け 0.5 ／ 負け 0</p>
              <p className="mt-1 text-xs text-white/35">
                PK戦は無いので、この3通りだけです。得点差は影響しません。
              </p>
            </div>
            <div>
              <p className="label mb-2">I（リーグの格）</p>
              <ul className="space-y-1 text-sm text-white/55">
                {Object.values(CATEGORIES).map((c) => (
                  <li key={c.label} className="flex justify-between gap-4">
                    <span>{c.label}</span>
                    <span className="font-mono text-volt">I = {c.importance}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <p className="label mb-2">ランク帯</p>
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <span
                  key={t.name}
                  className={`rounded-full px-3 py-1 text-[10px] font-black tracking-widest ${t.cls}`}
                >
                  {t.label} {Number.isFinite(t.min) ? `${t.min}+` : ''}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-white/35">
            対象はリーグ戦の承認済みの試合だけです。決勝トーナメントと、中止されたリーグの試合は含みません。
            結果が承認された時点で、両者のレートが同時に更新されます。
          </p>
        </section>

        <div className="mt-10 text-center">
          <Link href="/data" className="btn-ghost">みんなのデータを見る</Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 部品 ---------------- */

function Podium({ r }) {
  const medal = ['🥇', '🥈', '🥉'][r.rank - 1] ?? '';
  return (
    <article
      className={`wc-panel relative overflow-hidden p-6 text-center ${
        r.rank === 1 ? 'sm:-mt-3 sm:pb-9' : ''
      }`}
    >
      <div className="absolute right-3 top-2 text-3xl opacity-80">{medal}</div>
      <p className="wc-head">#{r.rank}</p>
      <div className="mt-4 flex justify-center">
        <Avatar src={r.photo_path} name={r.user_name} size="h-16 w-16" />
      </div>
      <p className="mt-3 truncate font-display text-xl text-chalk">{r.user_name}</p>
      <div className="mt-1 flex justify-center">
        <Presence lastSeenAt={r.last_seen_at} />
      </div>
      <p className="trophy-glow mt-4 font-display text-5xl text-gold">{Math.round(r.rating)}</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <TierBadge tier={r.tier} />
        <span className="text-[10px] text-white/35">{r.rating_matches}試合</span>
        <Delta value={r.last_delta} />
      </div>
    </article>
  );
}

function TierBadge({ tier }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-widest ${tier.cls}`}>
      {tier.label}
    </span>
  );
}

function Delta({ value }) {
  if (value === null || value === undefined) return <span className="text-xs text-white/20">–</span>;
  const v = Math.round(value * 10) / 10;
  if (v === 0) return <span className="font-mono text-xs text-white/35">±0</span>;
  return (
    <span className={`font-mono text-xs ${v > 0 ? 'text-volt' : 'text-red-400'}`}>
      {v > 0 ? '+' : ''}{v}
    </span>
  );
}

function Avatar({ src, name, size = 'h-9 w-9' }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white/50`}
    >
      {String(name ?? '?').slice(0, 2).toUpperCase()}
    </span>
  );
}
