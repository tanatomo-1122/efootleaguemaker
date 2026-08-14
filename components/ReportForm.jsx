'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PhotoInput from './PhotoInput';
import { STAT_KEYS } from '@/lib/schema';

/** ホーム側が結果を登録するフォーム（登録後はアウェイの承認待ちになる） */
export default function ReportForm({
  matchId, leagueId, homeName, awayName, homeEfootballId, awayEfootballId,
  initialStats, hasResult, existingImage,
}) {
  const router = useRouter();
  const [efootballId, setEfootballId] = useState('');
  const [file, setFile] = useState(null);
  const [stats, setStats] = useState(initialStats);
  const [imagePath, setImagePath] = useState(existingImage || null);
  const [analysis, setAnalysis] = useState(null);
  const [phase, setPhase] = useState(hasResult ? 'review' : 'upload'); // upload | analyzing | review
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('efootball_id');
      if (saved) setEfootballId(saved);
    } catch {}
  }, []);

  const isHome = efootballId.trim().toLowerCase() === String(homeEfootballId).toLowerCase();
  const setStat = (col) => (e) => setStats((s) => ({ ...s, [col]: e.target.value }));

  async function analyze() {
    if (!file) return setError('画像を選択してください');
    setBusy(true);
    setError(null);
    setPhase('analyzing');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`/api/matches/${matchId}/analyze`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImagePath(data.image_path || null);
        throw new Error(data.error || '読み取りに失敗しました');
      }
      setStats((s) => ({ ...s, ...cleanStats(data.stats) }));
      setImagePath(data.image_path);
      setAnalysis(data);
      setPhase('review');
    } catch (e) {
      setError(e.message);
      setPhase('review'); // 失敗しても手入力で続行できるようにする
    } finally {
      setBusy(false);
    }
  }

  function swap() {
    setStats((s) => {
      const next = { ...s };
      for (const { key } of STAT_KEYS) {
        next[`home_${key}`] = s[`away_${key}`];
        next[`away_${key}`] = s[`home_${key}`];
      }
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          efootball_id: efootballId,
          stats,
          image_path: imagePath,
          source: analysis?.matched ? 'auto' : 'manual',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      try { localStorage.setItem('efootball_id', efootballId); } catch {}
      setSent(true);
      setTimeout(() => {
        router.push(`/leagues/${leagueId}`);
        router.refresh();
      }, 1800);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card mt-10 p-10 text-center">
        <p className="headline text-3xl text-volt">送信しました</p>
        <p className="mt-4 text-sm text-white/60">
          アウェイの <span className="text-chalk">{awayEfootballId}</span> さんが承認すると、
          リーグ表に反映されます。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      {/* ---------- 本人確認 ---------- */}
      <section className="card p-6">
        <p className="label mb-4">Step 1 / あなたは誰？</p>
        <input
          className="field"
          value={efootballId}
          onChange={(e) => setEfootballId(e.target.value)}
          placeholder="あなたの efootball ID"
        />
        <p className="mt-3 text-xs text-white/40">
          結果を登録できるのはホーム側の{' '}
          <span className="text-chalk">{homeEfootballId}</span> さんです。
          {efootballId && !isHome && (
            <span className="mt-1 block text-amber-300">
              入力されたIDはホーム側ではありません。アウェイの方は、ホームの登録後に承認をお願いします。
            </span>
          )}
        </p>
      </section>

      {/* ---------- 画像アップロード ---------- */}
      <section className="card p-6">
        <p className="label mb-4">Step 2 / 試合結果の写真を送る</p>
        <PhotoInput onChange={setFile} hint="試合結果 or マッチスタッツ画面のスクショ" />
        <button
          type="button"
          onClick={analyze}
          disabled={!file || busy}
          className="btn-volt mt-5 w-full !py-3 text-sm"
        >
          {phase === 'analyzing' ? 'AI が読み取り中…' : 'AI に読み取らせる'}
        </button>
        <p className="mt-3 text-xs text-white/35">
          読み取り結果は次のステップで確認・修正できます。AI が使えない場合も手入力で登録できます。
        </p>
      </section>

      {/* ---------- 照合結果 ---------- */}
      {analysis && (
        <div
          className={`rounded-xl border p-5 text-sm ${
            analysis.matched
              ? 'border-volt/40 bg-volt/[0.06] text-chalk'
              : 'border-amber-400/40 bg-amber-400/[0.06] text-chalk'
          }`}
        >
          {analysis.matched ? (
            <>
              <p className="font-bold text-volt">スカッド名の照合に成功しました</p>
              <p className="mt-2 text-white/60">
                画像: 「{analysis.parsed_home_team_name}」 vs 「{analysis.parsed_away_team_name}」
                {analysis.direction === 'swapped' && ' → 左右が逆だったため自動で入れ替えました。'}
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-amber-300">スカッド名を自動照合できませんでした</p>
              <p className="mt-2 text-white/60">
                画像から読み取った名前: 「{analysis.parsed_home_team_name || '—'}」 /
                「{analysis.parsed_away_team_name || '—'}」<br />
                登録名: 「{homeName}」 / 「{awayName}」<br />
                左右が逆の場合は下の「HOME / AWAY を入れ替える」を押してください。
              </p>
            </>
          )}
          {analysis.notes ? <p className="mt-2 text-xs text-white/40">補足: {analysis.notes}</p> : null}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-400/[0.06] p-5 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* ---------- 確認・送信 ---------- */}
      {phase === 'review' && (
        <section className="card p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="label">Step 3 / 内容を確認して送信</p>
            <button type="button" onClick={swap} className="btn-ghost !px-4 !py-2 !text-[10px]">
              ⇄ HOME / AWAY を入れ替える
            </button>
          </div>

          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <span className="truncate text-sm font-bold text-chalk">{homeName}</span>
            <span className="label">項目</span>
            <span className="truncate text-sm font-bold text-chalk">{awayName}</span>
          </div>

          <div className="space-y-2">
            {STAT_KEYS.map(({ key, label }) => (
              <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <input
                  type="number"
                  step="any"
                  className={`field !py-2 text-center ${key === 'score' ? '!border-volt/50 font-display text-lg' : ''}`}
                  value={stats[`home_${key}`] ?? ''}
                  onChange={setStat(`home_${key}`)}
                />
                <span className="w-28 text-center text-[11px] text-white/45">{label}</span>
                <input
                  type="number"
                  step="any"
                  className={`field !py-2 text-center ${key === 'score' ? '!border-volt/50 font-display text-lg' : ''}`}
                  value={stats[`away_${key}`] ?? ''}
                  onChange={setStat(`away_${key}`)}
                />
              </div>
            ))}
          </div>

          {imagePath && (
            <div className="mt-6">
              <p className="label mb-2">送信された写真</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePath} alt="result" className="w-full rounded-xl border border-white/10" />
            </div>
          )}

          <button onClick={save} disabled={busy || !efootballId} className="btn-volt mt-7 w-full">
            {busy ? '送信中…' : 'この内容でアウェイに承認を依頼する'}
          </button>
          <p className="mt-3 text-center text-xs text-white/35">
            アウェイの {awayEfootballId} さんが承認するとリーグ表と matches.csv に反映されます。
          </p>
        </section>
      )}

      {phase === 'upload' && (
        <button
          type="button"
          onClick={() => setPhase('review')}
          className="w-full text-center text-xs text-white/40 underline hover:text-volt"
        >
          写真を使わず手入力で登録する
        </button>
      )}
    </div>
  );
}

function cleanStats(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[k] = v === null || v === undefined ? '' : v;
  }
  return out;
}
