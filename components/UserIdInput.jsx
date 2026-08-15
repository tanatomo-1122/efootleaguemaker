'use client';

import { useEffect, useState } from 'react';
import { USER_ID_PLACEHOLDER, normalizeUserId, isValidUserId } from '@/lib/user-id';

export const REMEMBER_KEY = 'efootball_user_id';

/** 前回入力したユーザーIDを取り出す（この端末にだけ保存される） */
export function loadRememberedUserId() {
  try {
    return localStorage.getItem(REMEMBER_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberUserId(value) {
  try {
    localStorage.setItem(REMEMBER_KEY, normalizeUserId(value));
  } catch {}
}

/**
 * ユーザーID（合言葉）の入力欄。
 * 既定では伏せ字にし、目のボタンで確認できる。
 */
export default function UserIdInput({
  value,
  onChange,
  label = 'あなたのユーザーID',
  hint,
  autoFill = true,
  required = false,
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!autoFill || value) return;
    const saved = loadRememberedUserId();
    if (saved) onChange(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filled = String(value || '').trim().length > 0;
  const valid = isValidUserId(value);

  return (
    <label className="block">
      <span className="label mb-2 block">🔒 {label}</span>
      <div className="relative">
        <input
          className="field pr-16 font-mono tracking-wider"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeUserId(e.target.value))}
          placeholder={USER_ID_PLACEHOLDER}
          autoComplete="off"
          spellCheck={false}
          required={required}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-volt"
        >
          {show ? '隠す' : '表示'}
        </button>
      </div>
      <span className="mt-2 block text-xs text-white/35">
        {hint ?? 'eFootball のマイページに表示されているユーザーIDです。合言葉として使います。'}
      </span>
      {filled && !valid && (
        <span className="mt-1 block text-xs text-amber-300">
          形式が違うようです（{USER_ID_PLACEHOLDER} のような形式）
        </span>
      )}
    </label>
  );
}
