/**
 * 在席状況の表示ルール。
 * サーバー・クライアントの両方から使うので DB 依存は持ち込まない。
 *
 * 「今いるか」より「最後にいつ来たか」が知りたい情報。
 * 音信不通の人を主催者が見分けられるようにするのが目的。
 */

export const ONLINE_MS = 3 * 60 * 1000; // これ以内なら「オンライン」
export const RECENT_MS = 30 * 60 * 1000; // これ以内なら「さっきまでいた」
export const STALE_DAYS = 2; // これ以上来ていないと「反応なし」として目立たせる

/**
 * @param {string|Date|null} lastSeenAt
 * @returns {{state:'online'|'recent'|'away'|'stale'|'never', label:string, days:number|null}}
 */
export function presenceOf(lastSeenAt) {
  if (!lastSeenAt) return { state: 'never', label: '未ログイン', days: null };

  const t = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(t.getTime())) return { state: 'never', label: '不明', days: null };

  const diff = Date.now() - t.getTime();
  const days = Math.floor(diff / 86400000);

  if (diff < ONLINE_MS) return { state: 'online', label: 'オンライン', days: 0 };
  if (diff < RECENT_MS) return { state: 'recent', label: `${Math.max(1, Math.round(diff / 60000))}分前`, days: 0 };
  if (days >= STALE_DAYS) return { state: 'stale', label: `${days}日前`, days };

  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return { state: 'away', label: hours >= 1 ? `${hours}時間前` : `${Math.round(diff / 60000)}分前`, days: 0 };
  }
  return { state: 'away', label: '1日前', days: 1 };
}

/** 表示用の色（Tailwind のクラス） */
export const PRESENCE_STYLE = {
  online: { dot: 'bg-volt', text: 'text-volt' },
  recent: { dot: 'bg-volt/60', text: 'text-white/60' },
  away: { dot: 'bg-white/30', text: 'text-white/45' },
  stale: { dot: 'bg-amber-400', text: 'text-amber-300' },
  never: { dot: 'bg-white/15', text: 'text-white/30' },
};
