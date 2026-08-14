/**
 * 決勝トーナメント表（表示のみ）
 * グループリーグの順位が確定した組から、実際のチーム名が埋まっていく。
 */
export default function Bracket({ bracket }) {
  if (!bracket || bracket.rounds.length === 0) return null;

  return (
    <section className="wc-panel mt-16 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/20 px-6 py-4">
        <div>
          <h2 className="font-display text-2xl uppercase italic text-gold">Knockout Stage</h2>
          <p className="mt-1 text-xs text-chalk/50">
            各グループの上位2名が進出。グループリーグの結果がそのままこの表につながります。
          </p>
        </div>
        <span className="rounded-full border border-gold/30 px-4 py-1.5 text-[10px] font-bold tracking-widest text-chalk/70">
          今後のアップデートで対戦・結果登録に対応予定
        </span>
      </header>

      <div className="overflow-x-auto p-6">
        <div className="flex min-w-max gap-6">
          {bracket.rounds.map((round, ri) => (
            <div key={ri} className="flex flex-col justify-around gap-4">
              <p className="wc-head text-center">{round.name}</p>
              {round.matches.map((pair, mi) => (
                <BracketMatch key={mi} pair={pair} first={ri === 0} />
              ))}
            </div>
          ))}

          {/* 優勝カップ */}
          <div className="flex flex-col justify-center">
            <p className="wc-head mb-3 text-center">Champion</p>
            <div className="flex h-20 w-40 flex-col items-center justify-center rounded-xl border border-gold/40 bg-gold/[0.08]">
              <span className="trophy-glow text-2xl">🏆</span>
              <span className="mt-1 text-[11px] tracking-widest text-gold/70">WINNER</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BracketMatch({ pair, first }) {
  return (
    <div className="w-52 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <Slot seed={first ? pair?.[0] : null} />
      <div className="h-px bg-white/10" />
      <Slot seed={first ? pair?.[1] : null} />
    </div>
  );
}

function Slot({ seed }) {
  if (!seed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
        <span className="text-xs text-white/25">勝者</span>
      </div>
    );
  }

  if (seed.label === 'BYE') {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
        <span className="text-xs text-white/20">不戦勝</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className={`truncate text-sm ${seed.team_name ? 'text-chalk' : 'text-white/30'}`}>
          {seed.team_name ?? '未確定'}
        </p>
        {seed.efootball_id && (
          <p className="truncate text-[10px] text-white/35">{seed.efootball_id}</p>
        )}
      </div>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${
          seed.settled ? 'bg-gold text-pitchdark' : 'bg-white/10 text-white/40'
        }`}
      >
        {seed.label}
      </span>
    </div>
  );
}
