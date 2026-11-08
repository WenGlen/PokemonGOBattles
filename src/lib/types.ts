/** 一隻寶可夢的靜態資料（data/gamemaster.json 的正規化格式） */
export interface PokemonData {
  id: string;
  dex: number;
  /** pvpoke 的英文名，例如 Giratina (Origin)。查國外攻略時用得到，所以留著 */
  name: string;
  /** 中文名，由抓資料腳本掛上（見 scripts/fetch-data.mjs 的「寶可夢都有中文名」檢查） */
  zh: string;
  types: string[];
  /** [攻擊, 防禦, HP] 種族值 */
  stats: [number, number, number];
  fast: string[];
  charged: string[];
  iv?: Record<string, [number, number, number, number]>;
  /** 這一筆本身就是暗影型態 */
  shadow?: boolean;
  shadowEligible?: boolean;
  tags?: string[];
}

/** 一個招式的靜態資料 */
export interface MoveData {
  id: string;
  /** pvpoke 的英文名 */
  name: string;
  /** 中文名 */
  zh: string;
  type: string;
  power: number;
  /** 大招的能量需求；快招為 0 */
  energy: number;
  /** 快招的能量獲得；大招為 0 */
  energyGain: number;
  /** 佔用幾個回合（1 回合 = 500ms） */
  turns: number;
  /** [自身能力變化, 對手能力變化]，單位為階 */
  buffs?: [number, number];
  buffTarget?: 'self' | 'opponent' | 'both';
  /** 觸發機率 0–1 */
  buffChance?: number;
}

export interface GameMaster {
  timestamp: string;
  pokemon: PokemonData[];
  moves: MoveData[];
}

/** 對戰中一方的設定 */
export interface Loadout {
  pokemon: PokemonData;
  fastMove: MoveData;
  chargedMoves: MoveData[];
  level: number;
  ivs: [number, number, number];
  shields: number;
  shadow: boolean;
  /** 大招策略：energy = 能量一滿就丟；optimal = 搜尋最快打倒對手的出招順序（會自己學會誘餌） */
  strategy: 'energy' | 'optimal';
  /** 開場能量，用於「換上場時已有能量」的情境 */
  startEnergy?: number;
}

/**
 * 顯示用名稱。資料管線有硬檢查保證每一筆都有中文名，
 * 這裡的 fallback 只是為了讓舊的 data/gamemaster.json 不會整個壞掉。
 * @param x 任何帶 name／zh 的資料
 */
export function zhName(x: { zh?: string | null; name: string }): string {
  return x.zh || x.name;
}

/** 變動日誌：清單過長時只留前幾筆，`more` 記下被截掉幾筆 */
export interface Capped<T> {
  items: T[];
  more: number;
}

/** 招式的精簡描述 */
export interface MoveBrief {
  id: string;
  zh: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  turns: number;
}

/** 招式某一個欄位的前後值 */
export interface FieldChange {
  key: string;
  label: string;
  from: number | string | number[] | null;
  to: number | string | number[] | null;
}

/** 會這招的主流寶可夢 */
export interface MoveUser {
  id: string;
  zh: string;
  /** 聯盟 CP 上限，字串形式 */
  league: string;
  rank: number;
}

export interface MoveChange extends MoveBrief {
  fields: FieldChange[];
  users: MoveUser[];
}

export interface MonBrief {
  id: string;
  zh: string;
  dex?: number;
  types?: string[];
}

export interface StatChange {
  id: string;
  zh: string;
  from: number[];
  to: number[];
}

export interface TypeChange {
  id: string;
  zh: string;
  from: string[];
  to: string[];
}

export interface MovesetChange {
  id: string;
  zh: string;
  gained: { id: string; zh: string }[];
  lost: { id: string; zh: string }[];
}

export interface RankMove {
  id: string;
  zh: string;
  from: number;
  to: number;
  delta: number;
}

/** 一次資料更新造成的所有變動 */
export interface ChangelogEntry {
  /** 觀察到這次變動的日期 */
  date: string;
  /** 上一版的資料 timestamp */
  from: string;
  /** 這一版的資料 timestamp */
  to: string;
  /** 回填歷史時才有：來源 commit */
  sha?: string;
  message?: string;
  /** 有沒有影響對戰的變動；只有排名動不算 */
  notable: boolean;
  moves: {
    added: Capped<MoveBrief>;
    removed: Capped<MoveBrief>;
    changed: Capped<MoveChange>;
  };
  pokemon: {
    added: Capped<MonBrief>;
    removed: Capped<MonBrief>;
    stats: Capped<StatChange>;
    types: Capped<TypeChange>;
    moveset: Capped<MovesetChange>;
  };
  rankings?: {
    leagues: Record<string, {
      entered: Capped<{ id: string; zh: string; rank: number }>;
      left: Capped<{ id: string; zh: string; rank: number }>;
      moved: Capped<RankMove>;
    }>;
    total: number;
  };
  counts: Record<string, number>;
}

export interface Changelog {
  entries: ChangelogEntry[];
  updatedAt?: string;
}
