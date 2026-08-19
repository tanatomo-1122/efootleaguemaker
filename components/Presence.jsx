import { presenceOf, PRESENCE_STYLE } from '@/lib/presence';

/**
 * 在席状況の表示。
 * 「今いるか」だけでなく「最後にいつ来たか」を出すのが肝。
 * 2日以上来ていない人は色を変えて目立たせる（主催者が代理対応を判断できるように）。
 */
export default function Presence({ lastSeenAt, showLabel = true, className = '' }) {
  const p = presenceOf(lastSeenAt);
  const style = PRESENCE_STYLE[p.state] ?? PRESENCE_STYLE.never;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={lastSeenAt ? `最終アクセス: ${new Date(lastSeenAt).toLocaleString('ja-JP')}` : '未ログイン'}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${
          p.state === 'online' ? 'animate-pulse' : ''
        }`}
      />
      {showLabel && <span className={`text-[10px] ${style.text}`}>{p.label}</span>}
    </span>
  );
}
