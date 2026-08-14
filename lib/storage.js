import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * 画像は Supabase Storage に保存する。
 * サーバー側からサービスロールキーでアップロードし、公開URLを DB に保存する。
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'efootleague';

const EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // 未設定でも画像なしでリーグは回せる
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function isStorageConfigured() {
  return getSupabase() !== null;
}

/**
 * FormData の File を Supabase Storage に保存し、公開URLを返す。
 * @returns {Promise<string|null>} 例: https://xxxx.supabase.co/storage/v1/object/public/efootleague/squad/....png
 */
export async function saveUpload(file, prefix = 'img') {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) return null;

  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[storage] Supabase Storage が未設定のため画像を保存しませんでした');
    return null;
  }

  const contentType = EXT[file.type] ? file.type : 'image/png';
  const ext = EXT[contentType] || '.png';
  const objectPath = `${prefix}/${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: false, cacheControl: '31536000' });

  if (error) throw new Error(`画像のアップロードに失敗しました: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function fileToBase64(file) {
  const buf = Buffer.from(await file.arrayBuffer());
  const mediaType = EXT[file.type] ? file.type : 'image/png';
  return { base64: buf.toString('base64'), mediaType };
}
