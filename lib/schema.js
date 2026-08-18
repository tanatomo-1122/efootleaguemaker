// matches.csv の仕様に完全一致するスタッツ項目
// 各項目は home_<key> / away_<key> の2カラムを持つ
export const STAT_KEYS = [
  { key: 'score', label: '得点' }, // ※画像の中央リストにはありませんが、便宜上残しています
  { key: 'possession', label: '支配率' },
  { key: 'shots', label: 'シュート' },
  { key: 'shots_goal', label: '枠内シュート' },
  { key: 'fouls', label: 'ファウル' },
  { key: 'offsides', label: 'オフサイド' },
  { key: 'corners', label: 'コーナーキック' },
  { key: 'free_kicks', label: 'フリーキック回数' },
  { key: 'passes', label: 'パス' },
  { key: 'pass_success', label: 'パス成功' },
  { key: 'cross', label: 'クロス' },
  { key: 'pass_cut', label: 'パスカット' },
  { key: 'tackle_success', label: 'タックル成功' },
  { key: 'saves', label: 'セーブ' },
];

export const STAT_COLUMNS = STAT_KEYS.flatMap((s) => [`home_${s.key}`, `away_${s.key}`]);

// matches.csv ヘッダ順（分析時に辿れるよう league_id / squad_id を追加）
export const MATCH_CSV_HEADER = [
  'match_id',
  'league_id',
  'home_squad_id',
  'away_squad_id',
  'home_team_name',
  'away_team_name',
  'match_result',
  ...STAT_COLUMNS,
];

export const SQUAD_CSV_HEADER = [
  'squad_id',
  'user_id',
  'team_name',
  'attack_formation',
  'defence_formation',
  'team_style',
  'team_power',
];

export const USER_CSV_HEADER = ['user_id', 'user_name'];

export const FORMATIONS = [
  '4-4-2','4-3-3', '4-3-2-1', '4-3-1-2', '4-2-3-1', '4-2-1-3', '4-1-4-1', '4-1-2-3','4-2-2-2',
  '3-4-3', '3-2-4-1', '3-2-3-2', '3-1-4-2', '5-3-2', '5-2-2-1', '5-2-1-2',
];

export const TEAM_STYLES = [
  'ポゼッション',
  'ショートカウンター',
  'ロングカウンター',
  'サイドアタック',
  'ロングボール',
  'なし',
];
