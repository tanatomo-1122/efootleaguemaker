import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague, listEntries } from '@/lib/league';
import JoinForm from '@/components/JoinForm';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export default async function JoinPage({ params }) {
  const leagueId = Number(params.id);
  const league = await getLeague(leagueId);
  if (!league) notFound();

  const entries = await listEntries(leagueId);
  const capacity = league.players_per_pool * league.pool_count;
  const remaining = capacity - entries.length;

  if (league.cancelled) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="headline text-4xl text-chalk">このリーグは中止されました</h1>
        {league.cancel_reason && (
          <p className="mt-4 text-sm text-white/50">理由: {league.cancel_reason}</p>
        )}
        <Link href="/leagues" className="btn-volt mt-8">他のリーグを探す</Link>
      </div>
    );
  }

  if (league.status !== 'recruiting') {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="headline text-4xl text-chalk">受付は終了しました</h1>
        <p className="mt-4 text-sm text-white/50">このリーグは既に組み合わせが確定しています。</p>
        <Link href={`/leagues/${leagueId}`} className="btn-volt mt-8">リーグ表を見る</Link>
      </div>
    );
  }

  return (
    <div className="pitch-stripes min-h-screen bg-gradient-to-b from-pitchdark via-ink to-ink">
      <div className="mx-auto max-w-2xl px-5 py-16">
        {/* エントリーパス風ヘッダー */}
        <div className="wc-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-gold/20 px-6 py-4">
            <span className="wc-head">Official Entry Sheet</span>
            <span className="wc-head">{league.name}</span>
          </div>
          <div className="px-6 py-8 text-center">
            <p className="trophy-glow font-display text-4xl uppercase italic text-gold">
              Squad Registration
            </p>
            <p className="mt-3 text-sm text-chalk/70">
              あなたのスカッドを、この大会に登録します。
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-gold/30 px-5 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-volt" />
              <span className="text-xs font-bold tracking-widest text-chalk">
                残り {remaining} 枠 / 定員 {capacity} 人
              </span>
            </div>
          </div>
        </div>

        <JoinForm leagueId={leagueId} remaining={remaining} />

        {entries.length > 0 && (
          <div className="mt-12">
            <p className="wc-head mb-4">登録済みのスカッド</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {entries.map((e) => (
                <li
                  key={e.entry_id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-chalk">{e.team_name}</p>
                    <p className="truncate text-xs text-white/40">
                      {e.user_name} ・ ⚔{e.attack_formation} 🛡{e.defence_formation}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-gold">{e.team_power}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
