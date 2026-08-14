'use client';

import { useRef, useState } from 'react';

/** 画像ファイル選択 + プレビュー */
export default function PhotoInput({ onChange, hint = '画像を選択', className = '' }) {
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');

  function pick(e) {
    const file = e.target.files?.[0] || null;
    onChange?.(file);
    setName(file?.name || '');
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div className={className}>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full items-center gap-4 rounded-xl border border-dashed border-white/20
                   bg-white/[0.03] p-4 text-left transition hover:border-volt/60"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="preview" className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/5 text-2xl text-white/30">
            +
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-chalk">{name || hint}</span>
          <span className="block text-xs text-white/30">PNG / JPG</span>
        </span>
      </button>
    </div>
  );
}
