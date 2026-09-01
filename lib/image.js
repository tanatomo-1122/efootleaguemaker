/**
 * 送信前に画像をブラウザ側で縮める。
 *
 * なぜ必要か:
 *   - Vercel のリクエストボディ上限は 4.5MB。最近のスマホのスクショは
 *     PNG で 3〜6MB あり、そのままだと送信自体が失敗しうる
 *   - アップロード時間と、AI に渡すトークン量がそのまま減る
 *
 * 注意: 試合結果の画像は AI が細かい数字を読むので、縮めすぎない。
 *       長辺 1920px あればスマホのスクショの文字は十分に読める。
 */

export const PRESET = {
  // 試合結果のスクショ（AIが読むので解像度を優先）
  result: { maxEdge: 1920, quality: 0.85, skipUnder: 500 * 1024 },
  // スカッド画像（人が見るだけ）
  squad: { maxEdge: 1600, quality: 0.8, skipUnder: 400 * 1024 },
  // プロフィール写真
  avatar: { maxEdge: 640, quality: 0.8, skipUnder: 150 * 1024 },
};

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 画像を縮小して JPEG にする。失敗したら元のファイルをそのまま返す（送信は止めない）。
 * @param {File} file
 * @param {object} opts { maxEdge, quality, skipUnder, force }
 *   force: true なら skipUnder と「縮めたら大きくなった」判定を無視して必ず再エンコードする。
 *          検証ページ(/dev/vision-test)で圧縮の影響を確かめるための逃げ道で、本番は false。
 * @returns {Promise<{file: File, before: number, after: number, changed: boolean}>}
 */
export async function compressImage(file, opts = PRESET.result) {
  const before = file?.size ?? 0;
  const unchanged = { file, before, after: before, changed: false };

  if (!file || !isBrowser()) return unchanged;
  if (!String(file.type).startsWith('image/')) return unchanged;
  // GIF はアニメーションが壊れるので触らない
  if (file.type === 'image/gif') return unchanged;

  const { maxEdge = 1920, quality = 0.85, skipUnder = 0, force = false } = opts;

  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);

    // 十分に小さいならそのまま
    if (!force && before <= skipUnder && longEdge <= maxEdge) {
      bitmap.close?.();
      return unchanged;
    }

    const scale = Math.min(1, maxEdge / longEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // 縮小時のにじみを抑える
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) return unchanged;

    // 縮めたのに大きくなったら元のまま（元が高圧縮JPEGのとき等）
    if (!force && blob.size >= before) return unchanged;

    const name = String(file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
    return {
      file: new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }),
      before,
      after: blob.size,
      changed: true,
      width,
      height,
      scale,
    };
  } catch {
    // 何かあっても送信自体は止めない
    return unchanged;
  }
}
