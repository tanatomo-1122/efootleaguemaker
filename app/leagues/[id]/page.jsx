import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getLeague, listEntries, listMatches, buildStandings, canFinalize, buildBracket, POOL_LABELS,
} from '@/lib/league';
import FinalizeButton from '@/components/FinalizeButton';
import Bracket from '@/components/Bracket';

export const dynamic = 'force-dynamic';

export default async function LeaguePage({ params }) {
  const leagueId = Number(params.id);
  const league = await getLeague(leagueId);
  if (!league) notFound();

  const entries = await listEntries(leagueId);
  const capacity = league.players_per_pool * league.pool_count;

  // 準備中画面: 規定人数に達するまで
  if (league.status === 'recruiting') {
    return <Preparing league={league} entries={entries} capacity={capacity} />;
  }

  const [pools, matches, bracket, finalizable] = await Promise.all([
    buildStandings(leagueId),
    listMatches(leagueId),
    buildBracket(leagueId),
    canFinalize(leagueId),
  ]);
  const done = matches.filter((m) => m.status === 'reported').length;
  const pending = matches.filter((m) => m.status === 'pending').length;
  const finished = league.status === 'finished';

  return (
    <div className="pitch-stripes bg-gradient-to-b from-pitchdark via-ink to-ink">
      <div className="mx-auto max-w-6xl px-5 py-14">
        {/* ヘッダー */}
        <div className="mb-10 text-center">
          <p className="wc-head">Group Stage</p>
          <h1 className="trophy-glow mt-3 font-display text-5xl uppercase italic text-gold sm:text-6xl">
            {league.name}
          </h1>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs">
            <Badge>{finished ? '確定済み' : '開催中'}</Badge>
            <Badge>{league.pool_count} プール × {league.players_per_pool} 人</Badge>
            {league.organizer_user_name && <Badge>主催 {league.organizer_user_name}</Badge>}
            <Badge>承認済み {done} / {matches.length} 試合</Badge>
            {pending > 0 && (
              <span className="rounded-full bg-amber-400 px-4 py-1.5 text-[11px] font-black tracking-widest text-ink">
                承認待ち {pending}
              </span>
            )}
          </div>
          <div className="mx-auto mt-6 h-1 w-full max-w-md overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gold transition-all"
              style={{ width: `${matches.length ? (done / matches.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* 順位表 */}
        <div className={`grid gap-6 ${league.pool_count > 1 ? 'xl:grid-cols-2' : ''}`}>
          {pools.map((pool) => (
            <GroupTable key={pool.pool_index} pool={pool} />
          ))}
        </div>

        {/* 決勝トーナメント表 */}
        <Bracket bracket={bracket} />

        {/* 対戦カード */}
        <h2 className="mt-16 text-center font-display text-3xl uppercase italic text-chalk">
          Fixtures & Results
        </h2>
        <p className="mt-2 text-center text-xs text-white/40">
          ホーム側が結果を登録し、アウェイ側が承認するとリーグ表に反映されます。
        </p>

        <div className="mt-8 space-y-10">
          {pools.map((pool) => (
            <PoolFixtures
              key={pool.pool_index}
              label={pool.label}
              matches={matches.filter((m) => m.pool_index === pool.pool_index)}
              locked={finished}
            />
          ))}
        </div>

        {/* 確定 */}
        <div className="mt-16 text-center">
          {finished ? (
            <div className="wc-panel mx-auto max-w-lg p-10">
              <p className="trophy-glow font-display text-4xl uppercase italic text-gold">Final</p>
              <p className="mt-4 text-sm text-chalk/70">
                全試合の結果が確定しました。お疲れさまでした。
              </p>
              <div className="mt-6 space-y-1 text-sm">
                {pools.map((p) => (
                  <p key={p.pool_index} className="text-chalk">
                    <span className="text-gold">GROUP {p.label} 優勝</span> — {p.rows[0]?.team_name ?? '—'}
                  </p>
                ))}
              </div>
              <Link href="/data" className="btn-ghost mt-8">みんなのデータを見る</Link>
            </div>
          ) : (
            <FinalizeButton
              leagueId={leagueId}
              enabled={finalizable}
              remaining={matches.length - done}
              organizerUserName={league.organizer_user_name}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 準備中画面 ---------------- */

function Preparing({ league, entries, capacity }) {
  const pct = Math.round((entries.length / capacity) * 100);
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 text-center">
      <p className="label">Preparing</p>
      <h1 className="headline mt-4 text-5xl text-chalk">{league.name}</h1>
      <p className="mt-6 text-sm text-white/50">
        規定人数に達すると自動で締め切られ、組み合わせが抽選されます。
      </p>

      <div className="headline mt-12 text-8xl text-volt">
        {entries.length}
        <span className="text-4xl text-white/20">/{capacity}</span>
      </div>
      <div className="mx-auto mt-6 h-2 w-full max-w-lg overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-volt transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-4 text-xs text-white/40">あと {capacity - entries.length} 人</p>

      <Link href={`/leagues/${league.league_id}/join`} className="btn-volt mt-10">
        エントリーする
      </Link>

      {entries.length > 0 && (
        <ul className="mx-auto mt-14 grid max-w-xl gap-2 text-left">
          {entries.map((e, i) => (
            <li key={e.entry_id} className="card flex items-center gap-4 px-5 py-3">
              <span className="font-mono text-xs text-white/30">{String(i + 1).padStart(2, '0')}</span>
              <Avatar src={e.user_photo} name={e.user_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-chalk">{e.team_name}</p>
                <p className="truncate text-xs text-white/40">
                  {e.user_name} ・ ⚔{e.attack_formation} 🛡{e.defence_formation} ・ {e.team_style}
                </p>
              </div>
              <span className="font-mono text-sm text-volt">{e.team_power}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- 順位表(W杯グループ) ---------------- */

function GroupTable({ pool }) {
  return (
    <section className="wc-panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-gold/20 px-5 py-3">
        <h3 className="font-display text-xl uppercase italic text-gold">Group {pool.label}</h3>
        <span className="wc-head">Standings</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-chalk/40">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 text-center font-medium">試</th>
              <th className="px-2 py-2 text-center font-medium">勝</th>
              <th className="px-2 py-2 text-center font-medium">分</th>
              <th className="px-2 py-2 text-center font-medium">敗</th>
              <th className="px-2 py-2 text-center font-medium">得</th>
              <th className="px-2 py-2 text-center font-medium">失</th>
              <th className="px-2 py-2 text-center font-medium">差</th>
              <th className="px-3 py-2 text-center font-bold text-gold">点</th>
            </tr>
          </thead>
          <tbody>
            {pool.rows.map((r) => (
              <tr
                key={r.entry_id}
                className={`border-b border-white/5 transition hover:bg-white/[0.04] ${
                  r.rank <= 2 ? 'bg-gold/[0.06]' : ''
                }`}
              >
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded font-display text-xs ${
                      r.rank <= 2 ? 'bg-gold text-pitchdark' : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {r.rank}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={r.user_photo} name={r.user_name} size="h-8 w-8" />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-chalk">{r.team_name}</p>
                      <p className="truncate text-[11px] text-chalk/40">
                        {r.user_name} ・ ⚔{r.attack_formation} 🛡{r.defence_formation} ・ TP{' '}
                        {r.team_power}
                      </p>
                    </div>
                  </div>
                </td>
                <Num v={r.played} />
                <Num v={r.win} />
                <Num v={r.draw} />
                <Num v={r.loss} />
                <Num v={r.goals_for} />
                <Num v={r.goals_against} />
                <Num v={r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff} />
                <td className="px-3 py-3 text-center font-display text-lg text-gold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Num({ v }) {
  return <td className="px-2 py-3 text-center font-mono text-chalk/70">{v}</td>;
}

/* ---------------- 対戦カード ---------------- */

function PoolFixtures({ label, matches, locked }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <section>
      <h3 className="mb-4 font-display text-lg uppercase italic text-gold">Group {label}</h3>
      <div className="space-y-6">
        {rounds.map((r) => (
          <div key={r}>
            <p className="wc-head mb-2">Matchday {r}</p>
            <div className="grid gap-2 lg:grid-cols-2">
              {matches.filter((m) => m.round === r).map((m) => (
                <MatchRow key={m.match_id} m={m} locked={locked} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchRow({ m, locked }) {
  const reported = m.status === 'reported';
  const pending = m.status === 'pending';

  const cta = reported
    ? { text: '詳細', cls: 'border border-white/15 text-white/40 hover:text-volt' }
    : pending
      ? { text: '承認する', cls: 'bg-amber-400 text-ink hover:brightness-110' }
      : { text: '結果報告', cls: 'bg-volt text-ink hover:brightness-110' };

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-black/40 px-4 py-3 ${
        pending ? 'border-amber-400/40' : 'border-white/10'
      }`}
    >
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-sm text-chalk">{m.home_team_name}</p>
        {pending && <p className="text-[10px] text-amber-300/80">登録済み</p>}
      </div>

      {reported || pending ? (
        <span
          className={`shrink-0 rounded-lg px-3 py-1 font-display text-sm ${
            reported ? 'bg-gold text-pitchdark' : 'border border-amber-400/60 text-amber-300'
          }`}
        >
          {m.home_score} - {m.away_score}
        </span>
      ) : (
        <span className="shrink-0 rounded-lg border border-white/15 px-3 py-1 font-mono text-xs text-white/35">
          vs
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-chalk">{m.away_team_name}</p>
        {pending && <p className="text-[10px] text-amber-300/80">承認待ち</p>}
      </div>

      {!locked && (
        <Link
          href={`/matches/${m.match_id}/report`}
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${cta.cls}`}
        >
          {cta.text}
        </Link>
      )}
    </div>
  );
}

/* ---------------- 小物 ---------------- */

function Badge({ children }) {
  return (
    <span className="rounded-full border border-gold/30 px-4 py-1.5 text-[11px] font-bold tracking-widest text-chalk/80">
      {children}
    </span>
  );
}

function Avatar({ src, name, size = 'h-9 w-9' }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/50`}>
      {String(name || '?').slice(0, 2).toUpperCase()}
    </span>
  );
}
