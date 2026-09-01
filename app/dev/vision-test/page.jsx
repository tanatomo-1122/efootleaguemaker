'use client';

/**
 * AI 読み取りの検証ページ（開発用）
 *
 * ねらい:
 *   「圧縮したせいで読めなくなっていないか」「モデルを変えると何が変わるか」を
 *   同じ画像・同じプロンプトで並べて確かめる。
 *
 * 本番の /api/matches/[id]/analyze とは違い、DB も Storage も触らない。
 * 圧縮は本番と同じ lib/image.js の compressImage をそのまま呼んでいるので、
 * 画面で見えている「圧縮後」は実際に送信される画像と同一。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compressImage, formatBytes, PRESET } from '@/lib/image';
import { STAT_KEYS } from '@/lib/schema';

const MODEL_PRESETS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'];

// eFootball の試合結果スクショは 1882 × 870 前後の横長。
// 長辺が 1920 を下回るので、本番の PRESET.result（maxEdge 1920 / skipUnder 500KB）では
// 「縮小もされず、再エンコードもされない = 未圧縮のまま送信」になる。
// そのため検証時の既定は、この解像度で実際に差が出る値にしてある。
const SRC_LONG_EDGE = 1882;
const EDGE_PRESETS = [1920, 1882, 1600, 1440, 1280, 1024, 800];

// 本番と同じ条件（＝この画像なら未圧縮になることを確認するため）
const PROD_SETTING = {
  maxEdge: PRESET.result.maxEdge,
  quality: PRESET.result.quality,
  skipUnderKB: Math.round(PRESET.result.skipUnder / 1024),
  force: false,
};
// 検証の既定（必ず圧縮を効かせる）
const TEST_SETTING = { maxEdge: 1280, quality: 0.85, skipUnderKB: 0, force: true };
const FIELDS = [
  { key: 'team_name', label: 'チーム名', text: true },
  ...STAT_KEYS,
];

/** 比較用に値をならす（null/空/％表記/前後空白の差は「同じ」とみなす） */
function norm(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().replace(/%$/, '').replace(/\s+/g, '');
}
const show = (v) => (norm(v) === '' ? '—' : String(v));

async function measure(file) {
  if (!file) return null;
  const url = URL.createObjectURL(file);
  let w = 0;
  let h = 0;
  try {
    const bmp = await createImageBitmap(file);
    w = bmp.width;
    h = bmp.height;
    bmp.close?.();
  } catch {
    /* 読めなくてもサイズだけは出す */
  }
  return { file, url, w, h, size: file.size, name: file.name, type: file.type };
}

export default function VisionTestPage() {
  const fileRef = useRef(null);

  const [orig, setOrig] = useState(null);
  const [comp, setComp] = useState(null);
  const [compressing, setCompressing] = useState(false);

  // 圧縮パラメータ（既定は本番の PRESET.result と同じ）
  const [maxEdge, setMaxEdge] = useState(TEST_SETTING.maxEdge);
  const [quality, setQuality] = useState(TEST_SETTING.quality);
  const [skipUnderKB, setSkipUnderKB] = useState(TEST_SETTING.skipUnderKB);
  const [force, setForce] = useState(TEST_SETTING.force);

  // モデル / プロンプト
  const [model, setModel] = useState(MODEL_PRESETS[0]);
  const [detail, setDetail] = useState('high');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [defaults, setDefaults] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [strictSchema, setStrictSchema] = useState(true);
  const [teamHints, setTeamHints] = useState('');

  // 実行結果
  const [targets, setTargets] = useState({ original: true, compressed: true });
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState({ original: null, compressed: null });
  const [err, setErr] = useState({ original: null, compressed: null });

  // 正解照合
  const [checking, setChecking] = useState(false);
  const [truth, setTruth] = useState({});

  // 既定のプロンプト/モデルをサーバーから取得（本番と同じものを初期値にする）
  useEffect(() => {
    fetch('/api/dev/vision-test')
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return;
        setDefaults(d);
        setSystemPrompt(d.system_prompt);
        setUserPrompt(d.user_prompt);
        if (d.default_model && !MODEL_PRESETS.includes(d.default_model)) {
          setModel(d.default_model);
        }
      })
      .catch(() => {});
  }, []);

  // 元画像 or 圧縮パラメータが変わったら圧縮し直す
  const recompress = useCallback(async (source) => {
    if (!source) return;
    setCompressing(true);
    try {
      const r = await compressImage(source, {
        maxEdge: Number(maxEdge) || 1920,
        quality: Number(quality) || 0.85,
        skipUnder: (Number(skipUnderKB) || 0) * 1024,
        force,
      });
      const m = await measure(r.file);
      setComp({ ...m, changed: r.changed });
    } finally {
      setCompressing(false);
    }
  }, [maxEdge, quality, skipUnderKB, force]);

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setRes({ original: null, compressed: null });
    setErr({ original: null, compressed: null });
    const m = await measure(f);
    setOrig(m);
    recompress(f);
  }

  useEffect(() => {
    if (orig?.file) recompress(orig.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxEdge, quality, skipUnderKB, force]);

  async function runOne(which, file) {
    const fd = new FormData();
    fd.append('image', file, file.name || 'image');
    fd.append('model', model);
    fd.append('detail', detail);
    fd.append('label', which);
    fd.append('strict_schema', strictSchema ? '1' : '0');
    if (teamHints.trim()) fd.append('team_hints', teamHints);
    if (systemPrompt) fd.append('system_prompt', systemPrompt);
    if (userPrompt) fd.append('user_prompt', userPrompt);

    const r = await fetch('/api/dev/vision-test', { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  }

  async function run() {
    if (!orig) return;
    setRunning(true);
    setRes({ original: null, compressed: null });
    setErr({ original: null, compressed: null });

    const jobs = [];
    if (targets.original) jobs.push(['original', orig.file]);
    if (targets.compressed && comp) jobs.push(['compressed', comp.file]);

    // 同じ条件で比べたいので同時に投げる
    await Promise.all(
      jobs.map(async ([which, file]) => {
        try {
          const d = await runOne(which, file);
          setRes((p) => ({ ...p, [which]: d }));
        } catch (e) {
          setErr((p) => ({ ...p, [which]: e.message }));
        }
      })
    );
    setRunning(false);
  }

  /** 表の1行分を組み立てる */
  const rows = useMemo(() => {
    const pick2 = (d, k) => (d ? d.parsed?.[k] : undefined);
    return FIELDS.flatMap((f) =>
      ['home', 'away'].map((side) => {
        const k = `${side}_${f.key}`;
        const o = pick2(res.original, k);
        const c = pick2(res.compressed, k);
        const t = truth[k];
        return {
          k,
          side,
          label: f.label,
          text: !!f.text,
          first: f.key === 'team_name' || side === 'home',
          o,
          c,
          t,
          diff: res.original && res.compressed && norm(o) !== norm(c),
          okO: norm(t) === '' ? null : norm(t) === norm(o),
          okC: norm(t) === '' ? null : norm(t) === norm(c),
        };
      })
    );
  }, [res, truth]);

  const summary = useMemo(() => {
    const diffs = rows.filter((r) => r.diff).length;
    const scored = rows.filter((r) => norm(r.t) !== '');
    return {
      diffs,
      graded: scored.length,
      hitO: scored.filter((r) => r.okO).length,
      hitC: scored.filter((r) => r.okC).length,
      readO: rows.filter((r) => norm(r.o) !== '').length,
      readC: rows.filter((r) => norm(r.c) !== '').length,
      total: rows.length,
    };
  }, [rows]);

  // 「なぜ未圧縮になるのか」をその場で説明する
  const skipNote = useMemo(() => {
    if (!orig) return null;
    const longEdge = Math.max(orig.w || 0, orig.h || 0);
    const edge = Number(maxEdge) || 1920;
    const skip = (Number(skipUnderKB) || 0) * 1024;
    if (force) return null;
    if (longEdge && longEdge <= edge && orig.size <= skip) {
      return `未圧縮になります: 長辺 ${longEdge}px ≦ maxEdge ${edge}px かつ ${formatBytes(orig.size)} ≦ skipUnder ${skipUnderKB}KB のため、lib/image.js が元ファイルをそのまま返します。maxEdge を ${longEdge}px 未満にするか、skipUnder を 0 にするか、上の「必ず再エンコードする」を ON にしてください。`;
    }
    if (longEdge && longEdge <= edge) {
      return `縮小はされません（長辺 ${longEdge}px ≦ maxEdge ${edge}px）。JPEG 再エンコードのみが効きます。解像度を落とした影響を見たいときは maxEdge を ${longEdge}px 未満にしてください。`;
    }
    return null;
  }, [orig, maxEdge, skipUnderKB, force]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="headline text-3xl text-chalk">
        vision <span className="text-volt">test</span>
      </h1>
      <p className="mt-2 text-sm text-white/50">
        圧縮前 / 圧縮後の画像を同じモデル・同じプロンプトに投げて、読み取れた内容を突き合わせます。
        DB にも Storage にも保存しません。
      </p>
      {defaults && !defaults.has_api_key && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          OPENAI_API_KEY が未設定です。.env.local に設定してください。
        </p>
      )}

      {/* ---------- 1. 画像 ---------- */}
      <section className="card mt-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label">1. 画像を選ぶ</h2>
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
            画像を選択
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <ImageCard title="圧縮前（元ファイル）" info={orig} />
          <ImageCard
            title="圧縮後（実際に送信される画像）"
            info={comp}
            base={orig}
            busy={compressing}
            note={
              comp && !comp.changed
                ? '条件を満たさないため未圧縮（元ファイルをそのまま送信）'
                : null
            }
          />
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-xs text-white/40">
            maxEdge（長辺の上限）— 元画像の長辺: {orig?.w ? Math.max(orig.w, orig.h) : SRC_LONG_EDGE}px
          </span>
          <div className="flex flex-wrap gap-2">
            {EDGE_PRESETS.map((e) => {
              const longEdge = orig?.w ? Math.max(orig.w, orig.h) : SRC_LONG_EDGE;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setMaxEdge(e)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    Number(maxEdge) === e
                      ? 'border-volt bg-volt/15 text-volt'
                      : 'border-white/20 text-white/60 hover:border-white/40'
                  }`}
                >
                  {e}
                  <span className="ml-1 font-normal text-white/30">
                    {e >= longEdge ? '(縮小なし)' : `${Math.round((e / longEdge) * 100)}%`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Num label="maxEdge (px)" value={maxEdge} onChange={setMaxEdge} step={80} />
          <Num label="quality (0-1)" value={quality} onChange={setQuality} step={0.05} />
          <Num label="skipUnder (KB)" value={skipUnderKB} onChange={setSkipUnderKB} step={50} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Check
            checked={force}
            onChange={setForce}
            label="必ず再エンコードする（skipUnder と「縮めたら大きくなった」判定を無視）"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setMaxEdge(TEST_SETTING.maxEdge);
              setQuality(TEST_SETTING.quality);
              setSkipUnderKB(TEST_SETTING.skipUnderKB);
              setForce(TEST_SETTING.force);
            }}
          >
            検証用の既定（{TEST_SETTING.maxEdge}px / 強制）
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setMaxEdge(PROD_SETTING.maxEdge);
              setQuality(PROD_SETTING.quality);
              setSkipUnderKB(PROD_SETTING.skipUnderKB);
              setForce(PROD_SETTING.force);
            }}
          >
            本番と同じ条件（{PROD_SETTING.maxEdge}px / skip {PROD_SETTING.skipUnderKB}KB）
          </button>
        </div>

        {skipNote && (
          <p className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs text-gold">
            {skipNote}
          </p>
        )}

        <p className="mt-2 text-xs text-white/30">
          本番の既定は lib/image.js の PRESET.result（{PRESET.result.maxEdge}px / {PRESET.result.quality} /{' '}
          {Math.round(PRESET.result.skipUnder / 1024)}KB）。試合結果のスクショは長辺が
          {' '}{SRC_LONG_EDGE}px 前後なので、この既定のままだと縮小もJPEG化もされず未圧縮で送信されます。
          数値を変えると即座に圧縮し直します。
        </p>
      </section>

      {/* ---------- 2. モデル ---------- */}
      <section className="card mt-6 p-6">
        <h2 className="label">2. モデルと条件</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs text-white/40">モデル</span>
            <div className="flex flex-wrap gap-2">
              {MODEL_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    model === m
                      ? 'border-volt bg-volt/15 text-volt'
                      : 'border-white/20 text-white/60 hover:border-white/40'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              className="field mt-2 text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="モデル名を直接入力"
            />
            {defaults?.default_model && (
              <p className="mt-1 text-xs text-white/30">
                現行の既定: {defaults.default_model}（OPENAI_MODEL）
              </p>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs text-white/40">image detail</span>
            <div className="flex gap-2">
              {['high', 'low', 'auto'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDetail(d)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    detail === d
                      ? 'border-volt bg-volt/15 text-volt'
                      : 'border-white/20 text-white/60 hover:border-white/40'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <span className="mt-4 mb-1 block text-xs text-white/40">出力形式の固定</span>
            <Check
              checked={strictSchema}
              onChange={setStrictSchema}
              label="Structured Outputs (json_schema / strict) を使う"
            />
            <p className="mt-1 text-xs text-white/30">
              OFF にすると従来の json_object。形がぶれるかどうかの比較用です。
            </p>

            <span className="mt-4 mb-1 block text-xs text-white/40">読み取り対象</span>
            <div className="flex gap-4 text-sm text-white/70">
              <Check
                checked={targets.original}
                onChange={(v) => setTargets((p) => ({ ...p, original: v }))}
                label="圧縮前"
              />
              <Check
                checked={targets.compressed}
                onChange={(v) => setTargets((p) => ({ ...p, compressed: v }))}
                label="圧縮後"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mt-3 text-xs text-white/40 underline hover:text-volt"
          onClick={() => setShowPrompt((v) => !v)}
        >
          {showPrompt ? 'プロンプトを隠す' : 'プロンプトを表示 / 編集'}
        </button>
        {showPrompt && (
          <div className="mt-3 space-y-3">
            <div>
              <span className="mb-1 block text-xs text-white/40">system prompt</span>
              <textarea
                className="field h-64 font-mono text-xs leading-relaxed"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs text-white/40">user prompt</span>
              <textarea
                className="field h-16 font-mono text-xs"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (!defaults) return;
                setSystemPrompt(defaults.system_prompt);
                setUserPrompt(defaults.user_prompt);
              }}
            >
              既定に戻す
            </button>
          </div>
        )}

        <div className="mt-5">
          <span className="mb-1 block text-xs text-white/40">
            チーム名の候補（カンマ区切り・任意）
          </span>
          <input
            className="field text-sm"
            value={teamHints}
            onChange={(e) => setTeamHints(e.target.value)}
            placeholder="つながリーヨ, あ"
          />
          <p className="mt-1 text-xs text-white/30">
            本番の /analyze では登録済みスカッド名が自動で候補として渡されます。
            ひらがな1文字のチーム名などはこれを入れると一気に当たるようになります。
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="btn-volt"
            disabled={!orig || running || compressing}
            onClick={run}
          >
            {running ? '読み取り中…' : 'AI に読ませる'}
          </button>
          <Check checked={checking} onChange={setChecking} label="正解を入力して照合する" />
        </div>
      </section>

      {/* ---------- 3. 結果 ---------- */}
      {(res.original || res.compressed || err.original || err.compressed) && (
        <section className="card mt-6 p-6">
          <h2 className="label">3. 読み取り結果</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MetaCard title="圧縮前" data={res.original} error={err.original} />
            <MetaCard title="圧縮後" data={res.compressed} error={err.compressed} />
          </div>

          {/* 「JSONには写っているのに表が空」を見逃さないための警告 */}
          <div className="mt-4 space-y-2">
            {[['圧縮前', res.original], ['圧縮後', res.compressed]].map(([t, d]) => {
              if (!d) return null;
              const shape = d.meta?.shape;
              const un = d.meta?.unmapped ?? [];
              if (shape === 'flat' && un.length === 0) return null;
              return (
                <p
                  key={t}
                  className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs text-gold"
                >
                  {t}: AI が指定どおりのキーで返しませんでした（{shape}）。
                  プログラム側で home_xxx / away_xxx に変換して表に出しています。
                  {un.length > 0 &&
                    ` 変換しきれなかったキー: ${un.slice(0, 10).join(', ')}${
                      un.length > 10 ? ` ほか${un.length - 10}件` : ''
                    }`}
                </p>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <Stat label="2つの差異" value={`${summary.diffs} 項目`} bad={summary.diffs > 0} />
            <Stat label="読めた項目 (圧縮前)" value={`${summary.readO}/${summary.total}`} />
            <Stat label="読めた項目 (圧縮後)" value={`${summary.readC}/${summary.total}`} />
            {summary.graded > 0 && (
              <>
                <Stat label="正解一致 (圧縮前)" value={`${summary.hitO}/${summary.graded}`} />
                <Stat label="正解一致 (圧縮後)" value={`${summary.hitC}/${summary.graded}`} />
              </>
            )}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/15 text-left text-xs uppercase tracking-widest text-white/40">
                  <th className="py-2 pr-3">項目</th>
                  <th className="py-2 pr-3">side</th>
                  <th className="py-2 pr-3">圧縮前</th>
                  <th className="py-2 pr-3">圧縮後</th>
                  {checking && <th className="py-2 pr-3">正解</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.k}
                    className={`border-b border-white/5 ${
                      r.diff ? 'bg-red-500/10' : ''
                    } ${r.first ? 'border-t border-white/10' : ''}`}
                  >
                    <td className="py-1.5 pr-3 text-white/60">{r.side === 'home' ? r.label : ''}</td>
                    <td className="py-1.5 pr-3 text-xs text-white/30">{r.side}</td>
                    <td className={`py-1.5 pr-3 font-mono ${cellTone(r.okO)}`}>{show(r.o)}</td>
                    <td className={`py-1.5 pr-3 font-mono ${cellTone(r.okC)}`}>{show(r.c)}</td>
                    {checking && (
                      <td className="py-1.5 pr-3">
                        <input
                          className="w-28 rounded border border-white/15 bg-white/[0.04] px-2 py-1 font-mono text-xs text-chalk outline-none focus:border-volt"
                          value={truth[r.k] ?? ''}
                          onChange={(e) =>
                            setTruth((p) => ({ ...p, [r.k]: e.target.value }))
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="mt-6">
            <summary className="cursor-pointer text-xs text-white/40 hover:text-volt">
              生レスポンス（JSON）を見る
            </summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Raw title="圧縮前 / AI の生出力" data={res.original} which="raw" />
              <Raw title="圧縮後 / AI の生出力" data={res.compressed} which="raw" />
              <Raw title="圧縮前 / 正規化後（表に使う値）" data={res.original} which="parsed" />
              <Raw title="圧縮後 / 正規化後（表に使う値）" data={res.compressed} which="parsed" />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function cellTone(ok) {
  if (ok === null || ok === undefined) return 'text-chalk';
  return ok ? 'text-volt' : 'text-red-300';
}

function ImageCard({ title, info, base, busy, note }) {
  const ratio =
    info && base && base.size ? Math.round((1 - info.size / base.size) * 100) : null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/50">{title}</span>
        {busy && <span className="text-xs text-white/30">処理中…</span>}
      </div>
      {info ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={info.url}
            alt={title}
            className="max-h-72 w-full rounded-lg object-contain"
          />
          <dl className="mt-3 space-y-1 text-xs text-white/50">
            <Row k="ファイル" v={info.name} />
            <Row k="形式" v={info.type} />
            <Row
              k="解像度"
              v={
                info.w
                  ? `${info.w} × ${info.h}` +
                    (base?.w && base.w !== info.w
                      ? `（長辺 ${Math.round((Math.max(info.w, info.h) / Math.max(base.w, base.h)) * 100)}%）`
                      : base?.w
                        ? '（縮小なし）'
                        : '')
                  : '—'
              }
            />
            <Row
              k="サイズ"
              v={
                <>
                  {formatBytes(info.size)}
                  {ratio !== null && (
                    <span className={ratio > 0 ? ' text-volt' : ' text-white/30'}>
                      {' '}
                      ({ratio > 0 ? `-${ratio}%` : '変化なし'})
                    </span>
                  )}
                </>
              }
            />
          </dl>
          {note && <p className="mt-2 text-xs text-gold">{note}</p>}
        </>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg bg-white/[0.03] text-sm text-white/25">
          未選択
        </div>
      )}
    </div>
  );
}

function MetaCard({ title, data, error }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs font-bold uppercase tracking-widest text-white/50">{title}</div>
      {error ? (
        <p className="mt-2 text-sm text-red-300">{error}</p>
      ) : data ? (
        <dl className="mt-2 space-y-1 text-xs text-white/50">
          <Row k="モデル" v={data.meta?.model} />
          <Row k="detail" v={data.meta?.detail} />
          <Row k="出力形式" v={data.meta?.response_format} />
          <Row
            k="キー形状"
            v={
              data.meta?.shape === 'flat'
                ? '指定どおり (home_xxx / away_xxx)'
                : data.meta?.shape === 'converted'
                  ? '⚠ 形がぶれたので変換した'
                  : '⚠ 1項目も取れなかった'
            }
          />
          <Row k="埋まった項目" v={`${data.meta?.filled ?? 0} / ${(data.meta?.unmapped?.length ?? 0) + (data.meta?.filled ?? 0)} 以上`} />
          <Row k="所要時間" v={`${((data.meta?.elapsed_ms ?? 0) / 1000).toFixed(1)} 秒`} />
          <Row
            k="トークン"
            v={
              data.meta?.usage
                ? `in ${data.meta.usage.prompt_tokens} / out ${data.meta.usage.completion_tokens}`
                : '—'
            }
          />
          <Row k="送信サイズ" v={formatBytes(data.image?.bytes)} />
          <Row
            k="チーム名"
            v={`${data.parsed?.home_team_name ?? '—'} vs ${data.parsed?.away_team_name ?? '—'}`}
          />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-white/25">未実行</p>
      )}
    </div>
  );
}

function Raw({ title, data, which = 'parsed' }) {
  if (!data) return null;
  const body = which === 'raw' ? data.meta?.raw_json : data.parsed;
  return (
    <div>
      <div className="mb-1 text-xs text-white/40">{title}</div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed text-white/70">
        {JSON.stringify(body, null, 2)}
      </pre>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-white/30">{k}</dt>
      <dd className="min-w-0 flex-1 break-all text-white/70">{v || '—'}</dd>
    </div>
  );
}

function Num({ label, value, onChange, step }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/40">{label}</span>
      <input
        type="number"
        step={step}
        className="field text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Check({ checked, onChange, label }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-volt"
      />
      {label}
    </label>
  );
}

function Stat({ label, value, bad }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
      <div className={`text-base font-bold ${bad ? 'text-red-300' : 'text-chalk'}`}>{value}</div>
    </div>
  );
}
