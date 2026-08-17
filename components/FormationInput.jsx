'use client';

import { useEffect, useState } from 'react';
import {
  FORMATION_PLACEHOLDER, FIELD_PLAYERS,
  sanitizeFormation, sumFormation, parseFormation,
} from '@/lib/formation';

/**
 * フォーメーションの自由記述入力。
 *
 * - スマホではテンキーが出る（type="text" + inputMode="numeric"）
 * - 入力中はエラーを出さず、合計人数だけをそっと表示する
 * - フォーカスが外れた時に "4-3-3" の形へ自動整形し、そこで初めてエラーを出す
 *
 * @param {string}   value      正規化済みの値（例: "4-3-3"）。不正な間は ''
 * @param {function} onChange   (formatted|'') を返す
 * @param {string[]} suggestions よく使う形（タップで入る）
 */
export default function FormationInput({
  value, onChange, label, hint, suggestions = [], showError = false,
}) {
  const [text, setText] = useState(value ?? '');
  const [touched, setTouched] = useState(false);

  // 親から値が変わったとき（クイック選択など）は表示も合わせる
  useEffect(() => {
    if (value && value !== sanitizeFormation(text).split('').join('-')) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const digits = sanitizeFormation(text);
  const total = sumFormation(digits);
  const result = parseFormation(text);

  // 入力途中は黙っている。外れた後（か送信時）だけ言う
  const visibleError = (touched || showError) && digits.length > 0 && !result.ok ? result.error : null;
  const emptyError = showError && digits.length === 0 ? 'フォーメーションを入力してください' : null;

  function handleChange(e) {
    const next = e.target.value;
    setText(next);
    setTouched(false); // 打ち直している間はエラーを引っ込める
    const r = parseFormation(next);
    onChange(r.ok ? r.formatted : '');
  }

  function handleBlur() {
    setTouched(true);
    const r = parseFormation(text);
    if (r.ok) {
      setText(r.formatted); // 433 → 4-3-3 に整形
      onChange(r.formatted);
    } else {
      onChange('');
    }
  }

  function pick(f) {
    setText(f);
    setTouched(true);
    const r = parseFormation(f);
    onChange(r.ok ? r.formatted : '');
  }

  return (
    <label className="block">
      {label && <span className="wc-head mb-2 block">{label}</span>}

      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={`field pr-24 font-mono text-lg tracking-widest ${
            visibleError || emptyError ? '!border-red-400/60' : result.ok ? '!border-volt/50' : ''
          }`}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={FORMATION_PLACEHOLDER}
        />

        {/* 入力中の相棒: 今何人か */}
        {digits.length > 0 && (
          <span
            className={`absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs ${
              total === FIELD_PLAYERS ? 'text-volt' : 'text-white/35'
            }`}
          >
            {total} / {FIELD_PLAYERS} 人
          </span>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => pick(f)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                value === f
                  ? 'border-volt bg-volt text-ink'
                  : 'border-white/15 text-white/50 hover:border-volt/60 hover:text-volt'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {visibleError || emptyError ? (
        <span className="mt-2 block text-xs text-red-400">{visibleError || emptyError}</span>
      ) : (
        <span className="mt-2 block text-xs text-white/35">
          {hint ?? '数字だけ打てば大丈夫です（433 でも 4-3-3 でも同じ）。GK は数えません。'}
        </span>
      )}
    </label>
  );
}
