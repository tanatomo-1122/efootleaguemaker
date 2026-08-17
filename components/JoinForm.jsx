'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PhotoInput from './PhotoInput';
import UserIdInput, { rememberUserId } from './UserIdInput';
import FormationInput from './FormationInput';
import { FORMATIONS, TEAM_STYLES } from '@/lib/schema';
import { parseFormation } from '@/lib/formation';

export default function JoinForm({ leagueId, remaining }) {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [form, setForm] = useState({
    team_name: '',
    attack_formation: '',
    defence_formation: '',
    team_style: 'ポゼッション',
    team_power: '',
  });
  const [showFormationError, setShowFormationError] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [drawn, setDrawn] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();

    // 送信時にもう一度だけ確認する（入力中は黙っている）
    const atk = parseFormation(form.attack_formation);
    const def = parseFormation(form.defence_formation);
    if (!atk.ok || !def.ok) {
      setShowFormationError(true);
      setError(
        !atk.ok
          ? `攻撃時フォーメーション: ${atk.error}`
          : `守備時フォーメーション: ${def.error}`
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('efootball_user_id', userId);
      if (photo) fd.append('squad_photo', photo);

      const res = await fetch(`/api/leagues/${leagueId}/entries`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '申し込みに失敗しました');

      rememberUserId(userId);

      if (data.drawn) {
        setDrawn(true);
        setTimeout(() => router.push(`/leagues/${leagueId}`), 2200);
      } else {
        router.push(`/leagues/${leagueId}`);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (drawn) {
    return (
      <div className="wc-panel mt-8 p-12 text-center">
        <p className="trophy-glow font-display text-5xl uppercase italic text-gold">Draw!</p>
        <p className="mt-4 text-sm text-chalk/80">
          規定人数に達しました。組み合わせ抽選が完了しています。
        </p>
        <p className="mt-2 text-xs text-white/40">リーグ表へ移動します…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      <Section n="01" title="出場選手（あなた）">
        <UserIdInput
          value={userId}
          onChange={setUserId}
          label="あなたのユーザーID"
          required
          hint="登録済みのユーザーIDで本人確認します。リーグ表には表示されません。"
        />
        <p className="mt-2 text-xs text-white/35">
          未登録の方は先に{' '}
          <a href="/register" className="text-volt underline">ユーザー登録</a> をどうぞ。
        </p>
      </Section>

      <Section n="02" title="スカッド情報">
        <div className="space-y-5">
          <label className="block">
            <span className="wc-head mb-2 block">スカッド名</span>
            <input
              className="field"
              value={form.team_name}
              onChange={set('team_name')}
              placeholder="例: TOMOYA FC"
              required
            />
            <span className="mt-2 block text-xs text-white/35">
              試合結果の画像から自動照合するので、ゲーム内の表記と揃えてください。
            </span>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormationInput
              label="⚔ 攻撃時フォーメーション"
              value={form.attack_formation}
              onChange={(v) => setForm((f) => ({ ...f, attack_formation: v }))}
              suggestions={FORMATIONS.slice(0, 6)}
              showError={showFormationError}
            />
            <FormationInput
              label="🛡 守備時フォーメーション"
              value={form.defence_formation}
              onChange={(v) => setForm((f) => ({ ...f, defence_formation: v }))}
              suggestions={FORMATIONS.slice(0, 6)}
              showError={showFormationError}
            />
          </div>
          <p className="-mt-2 text-xs text-white/35">
            攻撃時と守備時で形を変えている場合は、それぞれ入力してください。同じでも構いません。
          </p>

          <label className="block">
            <span className="wc-head mb-2 block">チームスタイル</span>
            <select className="field" value={form.team_style} onChange={set('team_style')}>
              {TEAM_STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="wc-head mb-2 block">チームパワー</span>
            <input
              type="number"
              className="field"
              value={form.team_power}
              onChange={set('team_power')}
              placeholder="例: 3120"
              min="1"
              required
            />
          </label>
        </div>
      </Section>

      <Section n="03" title="スカッドのスクリーンショット">
        <PhotoInput onChange={setPhoto} hint="スカッド画面のスクショを選ぶ" />
        <p className="mt-3 text-xs text-white/35">
          フォーメーション確認用。対戦相手も閲覧できます。
        </p>
      </Section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn-volt w-full !bg-gold" disabled={busy}>
        {busy ? '登録中…' : `エントリーを確定する（残り${remaining}枠）`}
      </button>
    </form>
  );
}

function Section({ n, title, children }) {
  return (
    <fieldset className="rounded-2xl border border-white/10 bg-black/40 p-6">
      <legend className="flex items-center gap-3 px-2">
        <span className="font-display text-lg italic text-gold">{n}</span>
        <span className="text-sm font-bold text-chalk">{title}</span>
      </legend>
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}
