'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import UserIdInput, { rememberUserId } from './UserIdInput';

const POLL_MS = 10000;
// 動きが無いまま放置されたタブが延々と叩き続けないよう、15分で止める
const IDLE_STOP_MS = 15 * 60 * 1000;
const MAX_LENGTH = 300;

// 状況共有でよく使う一言。タップですぐ送れる
const PRESETS = [
  '部屋立てました',
  'これから入ります',
  '少し待ってください',
  '回線が落ちました',
  'もう一度お願いします',
  'ありがとうございました',
];

/**
 * 対戦相手とのトーク。
 * 中身は最初は空で、ユーザーIDを入れて解錠したときだけ取りに行く。
 * 解錠後は5秒ごとに新着だけを拾う（画面が見えている間だけ）。
 */
export default function ChatPanel({ matchId, homeUserName, awayUserName }) {
  const [userId, setUserId] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [closed, setClosed] = useState(false);

  const [paused, setPaused] = useState(false);
  const lastIdRef = useRef(0);
  const idRef = useRef('');
  const bottomRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const fetchMessages = useCallback(async ({ action = 'list', body, incremental } = {}) => {
    const res = await fetch(`/api/matches/${matchId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        efootball_user_id: idRef.current,
        action,
        body,
        after_id: incremental ? lastIdRef.current : 0,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');

    if (data.closed) {
      setClosed(true);
      setMessages([]);
      return data;
    }

    if (data.messages.length > 0) lastActivityRef.current = Date.now();

    setMessages((prev) => {
      const next = incremental ? [...prev, ...data.messages] : data.messages;
      if (next.length) lastIdRef.current = next[next.length - 1].message_id;
      return next;
    });
    return data;
  }, [matchId]);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      idRef.current = userId;
      await fetchMessages();
      rememberUserId(userId);
      setUnlocked(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send(text) {
    const body = String(text ?? draft).trim();
    if (!body) return;
    setSending(true);
    setError(null);
    lastActivityRef.current = Date.now();
    setPaused(false);
    try {
      await fetchMessages({ action: 'post', body, incremental: true });
      setDraft('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  // 新着の取得（開いている間だけ / タブが裏なら休む / 放置されたら止める）
  useEffect(() => {
    if (!unlocked || closed || paused) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivityRef.current > IDLE_STOP_MS) {
        setPaused(true);
        return;
      }
      fetchMessages({ incremental: true }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [unlocked, closed, paused, fetchMessages]);

  function resume() {
    lastActivityRef.current = Date.now();
    setPaused(false);
    fetchMessages({ incremental: true }).catch(() => {});
  }

  // 新しいメッセージが来たら一番下へ
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  return (
    <section className="card mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">トーク</p>
        {unlocked && !closed && (
          paused ? (
            <button
              type="button"
              onClick={resume}
              className="rounded-full border border-white/20 px-3 py-1 text-[10px] tracking-widest text-white/50 hover:border-volt hover:text-volt"
            >
              自動更新は停止中 ・ 再開する
            </button>
          ) : (
            <span className="flex items-center gap-2 text-[10px] tracking-widest text-white/35">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-volt" />
              自動更新中
            </span>
          )
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-white/55">
        <span className="text-chalk">{homeUserName}</span> と{' '}
        <span className="text-chalk">{awayUserName}</span> の2人だけが使えます。
        部屋を立てたか、回線が落ちたかなどの連絡にどうぞ。
        <span className="text-white/35">試合結果が承認されると、やり取りは消えます。</span>
      </p>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {!unlocked ? (
        <div className="mt-5 space-y-4">
          <UserIdInput
            value={userId}
            onChange={setUserId}
            label="あなたのユーザーID"
            hint="この試合の対戦者だけがトークを開けます。"
          />
          <button
            type="button"
            onClick={unlock}
            disabled={busy || !userId}
            className="btn-volt w-full !py-3 text-sm"
          >
            {busy ? '確認中…' : 'トークを開く'}
          </button>
        </div>
      ) : closed ? (
        <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/50">
          この試合は終了しているため、トークは見られません。
        </p>
      ) : (
        <>
          {/* 履歴 */}
          <div className="mt-5 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-4">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-xs text-white/30">
                まだメッセージはありません。下から送ってみてください。
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.message_id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${m.mine ? 'text-right' : 'text-left'}`}>
                    <div
                      className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${
                        m.mine
                          ? 'bg-volt text-ink'
                          : 'border border-white/10 bg-white/[0.06] text-chalk'
                      }`}
                    >
                      {m.body}
                    </div>
                    <p className="mt-1 text-[10px] text-white/30">
                      {m.mine ? 'あなた' : m.user_name} ・ {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* 定型文 */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={sending}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/55 transition hover:border-volt/60 hover:text-volt disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>

          {/* 入力 */}
          <div className="mt-3 flex gap-2">
            <input
              className="field flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="メッセージを入力"
              maxLength={MAX_LENGTH}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={sending || !draft.trim()}
              className="btn-volt !px-6 !py-3 text-sm"
            >
              {sending ? '…' : '送信'}
            </button>
          </div>
          <p className="mt-2 text-right text-[10px] text-white/25">
            {draft.length} / {MAX_LENGTH}
          </p>
        </>
      )}
    </section>
  );
}

function formatTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
