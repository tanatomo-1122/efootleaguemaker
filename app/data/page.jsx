import {
  formationWinRates, formationMatrix, publicSummary, finishedLeagueChampions,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'みんなのデータ | efootleaguemaker' };

/**
 * 公開ページ。参加者が見て楽しいデータだけを載せる。
 * 生の試合スタッツやスカッド一覧、CSV は公開しない（運営が npm run export で取り出す）。
 */
export default async function DataPage() {
  const [summary, rates, { axis, matrix }, finished] = await Promise.all([
    publicSummary(),
    formationWinRates(),
    formationMatrix(),
    finishedLeagueChampions(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <p className="label mb-3">Community Stats</p>
      <h1 className="headline text-5xl text-chalk">みんなのデータ</h1>
      <p className="mt-4 max-w-2xl text-sm text-white/50">
        これまでに行われた全試合から集計しています。承認済みの試合が増えるたびに自動で更新されます。
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-4">
        <Kpi n={summary.matches} label="記録された試合" />
        <Kpi n={summary.goals} label="生まれたゴール" />
        <Kpi n={summary.players} label="参加プレイヤー" />
        <Kpi n={summary.leagues} label="開催リーグ" />
      </div>

      {/* ---------- 終了した大会の記録 ---------- */}
      <h2 className="headline mt-16 text-3xl text-chalk">
        歴代の<span className="text-volt">大会結果</span>
      </h2>
      <p className="mt-2 text-xs text-white/40">
        確定した大会と、その勝ち抜けた人（グループ1位）です。
      </p>

      {finished.length === 0 ? (
        <p className="card mt-6 p-12 text-center text-sm text-white/40">
          まだ確定した大会がありません。
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {finished.map((l) => (
            <article key={l.league_id} className="wc-panel overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gold/20 px-5 py-3">
                <h3 className="font-display text-xl uppercase italic text-gold">{l.league_name}</h3>
                <span className="wc-head">
                  {l.entry_count}人 ・ {l.pool_count}グループ ・ {formatDate(l.created_at)}
                </span>
              </header>

              <ul className="divide-y divide-white/5">
                {l.champions.map((c) => (
                  <li key={c.pool_index} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className="trophy-glow text-2xl">🏆</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg text-chalk">{c.team_name}</p>
                      <p className="truncate text-xs text-white/40">
                        {c.user_name} ・ ⚔{c.attack_formation} 🛡{c.defence_formation}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-gold">
                        勝点 {c.points} ・ 得失 {c.goal_diff > 0 ? `+${c.goal_diff}` : c.goal_diff}
                      </p>
                      <p className="wc-head mt-0.5">
                        {l.pool_count > 1 ? `GROUP ${c.label} 優勝` : '優勝'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {/* ---------- フォーメーション別勝率 ---------- */}
      <h2 className="headline mt-16 text-3xl text-chalk">
        フォーメーション別<span className="text-volt">勝率</span>
      </h2>
      <p className="mt-2 text-xs text-white/40">攻撃時フォーメーション別。試合数の多い順。</p>

      {rates.length === 0 ? (
        <Empty />
      ) : (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40">
                {['フォーメーション', '試合', '勝率', '勝', '分', '敗', '平均得点', '平均失点', '平均勝点'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.formation} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-display text-chalk">{r.formation}</td>
                  <td className="px-4 py-3 font-mono text-white/50">{r.played}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-volt" style={{ width: `${r.win_rate}%` }} />
                      </div>
                      <span className="font-display text-volt">{r.win_rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-white/60">{r.wins}</td>
                  <td className="px-4 py-3 font-mono text-white/60">{r.draws}</td>
                  <td className="px-4 py-3 font-mono text-white/60">{r.losses}</td>
                  <td className="px-4 py-3 font-mono text-white/60">{r.avg_gf}</td>
                  <td className="px-4 py-3 font-mono text-white/60">{r.avg_ga}</td>
                  <td className="px-4 py-3 font-mono text-white/60">{r.points_per_game}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- 相性表 ---------- */}
      <h2 className="headline mt-16 text-3xl text-chalk">
        フォーメーション<span className="text-volt">相性表</span>
      </h2>
      <p className="mt-2 text-xs text-white/40">
        縦が自分、横が相手。セルの数字はその組み合わせでの勝率（下段は試合数）。
      </p>

      {axis.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="card mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-carbon px-3 py-3 text-left text-[10px] uppercase tracking-wider text-white/40">
                    自分 ＼ 相手
                  </th>
                  {axis.map((f) => (
                    <th key={f} className="px-2 py-3 text-center font-display text-[11px] text-chalk/70">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {axis.map((my, i) => (
                  <tr key={my} className="border-t border-white/5">
                    <th className="sticky left-0 z-10 bg-carbon px-3 py-2 text-left font-display text-[11px] text-chalk/70">
                      {my}
                    </th>
                    {matrix[i].map((cell, j) => (
                      <td key={j} className="p-1">
                        <Cell cell={cell} same={i === j} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] text-white/40">
            <Legend color="bg-volt/80" label="勝率 60%以上（相性◎）" />
            <Legend color="bg-volt/35" label="50〜60%" />
            <Legend color="bg-white/10" label="40〜50%" />
            <Legend color="bg-red-400/40" label="40%未満（相性×）" />
            <span>／ 対戦実績のない組み合わせは空欄</span>
          </div>
        </>
      )}

      <p className="mt-16 text-center text-xs text-white/25">
        ※ 個々の試合スタッツやスカッドの詳細データは公開していません。
      </p>
    </div>
  );
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP');
}

function Cell({ cell, same }) {
  if (!cell.played) {
    return <div className="h-11 rounded border border-white/[0.04] bg-white/[0.01]" />;
  }
  const r = cell.win_rate;
  const bg =
    r >= 60 ? 'bg-volt/80 text-ink'
      : r >= 50 ? 'bg-volt/35 text-chalk'
        : r >= 40 ? 'bg-white/10 text-chalk/80'
          : 'bg-red-400/40 text-chalk';
  return (
    <div
      className={`flex h-11 flex-col items-center justify-center rounded ${bg} ${
        same ? 'ring-1 ring-white/20' : ''
      }`}
      title={`${cell.played}試合 / ${cell.wins}勝 ${cell.draws}分`}
    >
      <span className="font-display text-[13px] leading-none">{r}%</span>
      <span className="mt-0.5 text-[9px] opacity-60">{cell.played}試合</span>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-3 w-6 rounded ${color}`} />
      {label}
    </span>
  );
}

function Empty() {
  return (
    <p className="card mt-6 p-12 text-center text-sm text-white/40">
      まだ集計できる試合がありません。リーグを進めるとここに反映されます。
    </p>
  );
}

function Kpi({ n, label }) {
  return (
    <div className="card p-6">
      <div className="headline text-4xl text-volt">{n}</div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}
