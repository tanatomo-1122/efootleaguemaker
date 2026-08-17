import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatch, getLeague, POOL_LABELS } from '@/lib/league';
import { STAT_COLUMNS } from '@/lib/schema';
import ReportForm from '@/components/ReportForm';
import ApprovePanel from '@/components/ApprovePanel';
import RoomPanel from '@/components/RoomPanel';
import ChatPanel from '@/components/ChatPanel';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }) {
  const matchId = Number(params.id);
  const match = await getMatch(matchId);
  if (!match) notFound();

  const league = await getLeague(match.league_id);
  const stats = {};
  for (const c of STAT_COLUMNS) stats[c] = match[c] ?? '';

  const common = {
    matchId,
    leagueId: match.league_id,
    homeName: match.home_team_name,
    awayName: match.away_team_name,
    homeUserName: match.home_user_name,
    awayUserName: match.away_user_name,
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Link href={`/leagues/${match.league_id}`} className="text-xs text-white/40 hover:text-volt">
        ← {league.name}
      </Link>

      <p className="label mt-6">
        Group {POOL_LABELS[match.pool_index] ?? match.pool_index + 1} ・ Matchday {match.round}
        <StatusChip status={match.status} />
      </p>

      <div className="mt-4 flex items-center justify-between gap-4">
        <Side name={match.home_team_name} user={match.home_user_name} side="HOME（結果を登録する側）" align="text-left" />
        <span className="font-display text-2xl italic text-white/25">VS</span>
        <Side name={match.away_team_name} user={match.away_user_name} side="AWAY（承認する側）" align="text-right" />
      </div>

      {/* 対戦部屋とトーク: まだ試合が終わっていないときだけ出す */}
      {!league.cancelled && league.status !== 'finished' && match.status !== 'reported' && (
        <>
          <RoomPanel
            matchId={matchId}
            homeUserName={match.home_user_name}
            awayUserName={match.away_user_name}
            hasRoom={match.room_code !== null}
            roomPostedAt={formatTime(match.room_posted_at)}
          />
          <ChatPanel
            matchId={matchId}
            homeUserName={match.home_user_name}
            awayUserName={match.away_user_name}
          />
        </>
      )}

      {league.cancelled ? (
        <p className="mt-12 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-6 text-center text-sm text-white/60">
          このリーグは中止されているため、結果の登録・承認はできません。
          {league.cancel_reason ? `（理由: ${league.cancel_reason}）` : ''}
        </p>
      ) : league.status === 'finished' ? (
        <p className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/50">
          このリーグは確定済みのため、結果の変更はできません。
        </p>
      ) : match.status === 'pending' ? (
        <>
          <ApprovePanel
            {...common}
            stats={stats}
            imagePath={match.image_path}
            reportedAt={formatTime(match.reported_at)}
          />
          <Collapsible summary="ホームの方: 内容を間違えたので登録し直す">
            <ReportForm {...common} initialStats={stats} hasResult existingImage={match.image_path} />
          </Collapsible>
        </>
      ) : match.status === 'reported' ? (
        <>
          <div className="card mt-10 p-10 text-center">
            <p className="label">承認済み</p>
            <p className="headline mt-3 text-5xl text-volt">
              {match.home_score} <span className="text-white/25">-</span> {match.away_score}
            </p>
            <p className="mt-4 text-sm text-white/50">
              アウェイの {match.away_user_name} さんが承認済みです。リーグ表に反映されています。
            </p>
            <Link href={`/leagues/${match.league_id}`} className="btn-ghost mt-8">リーグ表を見る</Link>
          </div>
          <Collapsible summary="結果を登録し直す（再度アウェイの承認が必要になります）">
            <ReportForm {...common} initialStats={stats} hasResult existingImage={match.image_path} />
          </Collapsible>
        </>
      ) : (
        <>
          {match.reject_note && (
            <div className="mt-8 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-5 text-sm">
              <p className="font-bold text-amber-300">アウェイから差し戻されました</p>
              <p className="mt-2 text-white/60">理由: {match.reject_note}</p>
            </div>
          )}
          <ReportForm
            {...common}
            initialStats={stats}
            hasResult={false}
            existingImage={match.image_path}
          />
        </>
      )}
    </div>
  );
}

function formatTime(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
}

function Collapsible({ summary, children }) {
  return (
    <details className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-white/40 hover:text-volt">
        {summary}
      </summary>
      {children}
    </details>
  );
}

function StatusChip({ status }) {
  const map = {
    scheduled: ['未登録', 'bg-white/10 text-white/60'],
    pending: ['承認待ち', 'bg-amber-400 text-ink'],
    reported: ['承認済み', 'bg-volt text-ink'],
  };
  const [text, cls] = map[status] ?? map.scheduled;
  return (
    <span className={`ml-3 rounded-full px-3 py-1 text-[10px] font-black tracking-widest ${cls}`}>
      {text}
    </span>
  );
}

function Side({ name, user, side, align }) {
  return (
    <div className={`min-w-0 flex-1 ${align}`}>
      <p className="label">{side}</p>
      <p className="mt-1 truncate font-display text-2xl text-chalk">{name}</p>
      <p className="truncate text-xs text-white/40">{user}</p>
    </div>
  );
}
