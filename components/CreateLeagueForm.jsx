'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdentityGate from './IdentityGate';
import { useSession } from './SessionProvider';
import { CATEGORIES } from '@/lib/rank';

export default function CreateLeagueForm() {
  const router = useRouter();
  const { user } = useSession();
  const [form, setForm] = useState({
    name: '',
    category: 'general',
    players_per_pool: 4,
    pool_count: 1,
    recruit_start: '',
    recruit_end: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const capacity = Number(form.players_per_pool) * Number(form.pool_count);
  const perPool = Number(form.players_per_pool);
  const matches = ((perPool * (perPool - 1)) / 2) * Number(form.pool_count);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          players_per_pool: Number(form.players_per_pool),
          pool_count: Number(form.pool_count),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '作成に失敗しました');
      router.push(`/leagues/${data.league.league_id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-7">
      <Field label="リーグ名">
        <input className="field" value={form.name} onChange={set('name')} placeholder="例: 第1回 efootleague 杯" required />
      </Field>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <IdentityGate hint="ログインしている人が主催者になります。結果を確定できるのは主催者だけです。" />
      </div>

      <Field label="リーグの格（EFLランクへの影響）">
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <button
              key={key}
              type="button"
              onClick={() => setForm((f) => ({ ...f, category: key }))}
              className={`rounded-xl border p-3 text-left transition ${
                form.category === key
                  ? 'border-volt bg-volt/10'
                  : 'border-white/15 hover:border-volt/50'
              }`}
            >
              <span className="block text-sm font-bold text-chalk">{c.label}</span>
              <span className="mt-1 block font-mono text-[11px] text-volt">I = {c.importance}</span>
            </button>
          ))}
        </div>
        <span className="mt-2 block text-xs text-white/35">
          格が高いほど、1試合でEFLランクが大きく動きます。
          <span className="text-white/25">公式リーグは運営者のみ作成できます。</span>
        </span>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="1リーグ(プール)の人数">
          <select className="field" value={form.players_per_pool} onChange={set('players_per_pool')}>
            {[3, 4, 5, 6, 7, 8, 10, 12, 16].map((n) => (
              <option key={n} value={n}>{n} 人</option>
            ))}
          </select>
        </Field>
        <Field label="プール数">
          <select className="field" value={form.pool_count} onChange={set('pool_count')}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} プール（{'ABCDEFGH'.slice(0, n).split('').join('・')}）
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-xl border border-volt/30 bg-volt/[0.06] p-5">
        <p className="label mb-3 !text-volt/70">この設定でできるリーグ</p>
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <Summary n={capacity} unit="人" label="定員(自動締切)" />
          <Summary n={matches} unit="試合" label="総試合数" />
          <Summary n={perPool - 1} unit="節" label="各プールの節数" />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="募集開始日時（任意）">
          <input type="datetime-local" className="field" value={form.recruit_start} onChange={set('recruit_start')} />
        </Field>
        <Field label="募集終了日時（任意）">
          <input type="datetime-local" className="field" value={form.recruit_end} onChange={set('recruit_end')} />
        </Field>
      </div>

      <Field label="ひとこと紹介（任意）">
        <textarea className="field h-24 resize-none" value={form.description} onChange={set('description')} placeholder="例: 初心者歓迎。1日1試合ペースでゆるくやります。" />
      </Field>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn-volt w-full" disabled={busy}>
        {busy ? '作成中…' : 'リーグを作成して募集を開始'}
      </button>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Summary({ n, unit, label }) {
  return (
    <div>
      <span className="font-display text-3xl text-volt">{n}</span>
      <span className="ml-1 text-sm text-white/50">{unit}</span>
      <div className="label mt-1">{label}</div>
    </div>
  );
}
