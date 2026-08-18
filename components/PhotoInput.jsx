'use client';

import { useRef, useState } from 'react';
import { compressImage, formatBytes, PRESET } from '@/lib/image';

/**
 * 画像ファイル選択 + プレビュー。
 * 選んだ時点でブラウザ内で縮小してから親に渡す（送信するのは縮小後のファイル）。
 */
export default function PhotoInput({
  onChange, hint = '画像を選択', className = '', preset = 'result',
}) {
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState(null);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const original = e.target.files?.[0] || null;
    if (!original) {
      onChange?.(null);
      setName('');
      setSize(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      return;
    }

    setBusy(true);
    setName(original.name);
    try {
      const result = await compressImage(original, PRESET[preset] ?? PRESET.result);
      onChange?.(result.file);
      setSize(result);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(result.file));
    } finally {
      setBusy(false);
    }
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
            {busy ? '…' : '+'}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-chalk">{name || hint}</span>
          <span className="block text-xs text-white/30">
            {busy
              ? '準備中…'
              : size
                ? size.changed
                  ? `${formatBytes(size.before)} → ${formatBytes(size.after)} に圧縮しました`
                  : `${formatBytes(size.after)}（そのまま送信）`
                : 'PNG / JPG'}
          </span>
        </span>
      </button>
    </div>
  );
}
