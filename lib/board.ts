// 所在ボード（種付当日の牝馬が今どこにいるか）のデータ定義
import { genId } from "./storage";

// 場所（ゾーン）：馬積場→洗い場→待機→第1/第2種付場→保留・処置→帰宅
export const ZONES = [
  "馬積場",
  "洗い場",
  "待機",
  "第1種付場",
  "第2種付所",
  "保留・処置",
  "帰宅",
] as const;
export type Zone = (typeof ZONES)[number];

// 保留・処置の状態タグ
export const MARE_TAGS = [
  "種付出来ず待機",
  "鎮静",
  "直検",
  "P値待ち",
] as const;
export type MareTag = (typeof MARE_TAGS)[number];

export type Mare = {
  id: string;
  mareName: string; // 牝馬名
  farm?: string; // 牧場
  sireCode: string; // 交配する父（種牡馬）コード 例: ＫＢＬ
  apptTime?: string; // 予約時間 例: "7:30"
  kind?: "新" | "再" | ""; // 新/再
  zone: Zone; // 現在地
  tags: MareTag[]; // 状態タグ
  memo?: string;
  arrivedAt?: string; // 馬積場到着
};

// 種牡馬コードごとの色（決定的ハッシュ）
const SIRE_PALETTE = [
  "#e2231a",
  "#0f6fc0",
  "#12a13f",
  "#f08300",
  "#8e44ad",
  "#e85298",
  "#0f8a8a",
  "#c0392b",
  "#334155",
  "#b8860b",
];
export function sireColor(code: string): string {
  let h = 0;
  for (const ch of code || "?") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SIRE_PALETTE[h % SIRE_PALETTE.length];
}

export function newMare(patch: Partial<Mare> = {}): Mare {
  return {
    id: genId("mare"),
    mareName: "",
    farm: "",
    sireCode: "",
    apptTime: "",
    kind: "",
    zone: "馬積場",
    tags: [],
    ...patch,
  };
}

// 見本データ（順番表より）
export const sampleMares: Mare[] = [
  newMare({ mareName: "エジプシャンストーム", farm: "ヤナガワ牧場", sireCode: "ＫＢＬ", apptTime: "7:30", kind: "新", zone: "馬積場" }),
  newMare({ mareName: "グレイスフル", farm: "坂東牧場", sireCode: "ＫＢＬ", apptTime: "16:45", kind: "新", zone: "洗い場" }),
  newMare({ mareName: "コミッショニング", farm: "服部牧場", sireCode: "ＥＱＸ", apptTime: "12:45", kind: "新", zone: "待機" }),
  newMare({ mareName: "ラブインジエア", farm: "千代田牧場", sireCode: "ＫＺＮ", apptTime: "", kind: "新", zone: "第1種付場" }),
  newMare({ mareName: "アートハウス", farm: "ノースヒルズ", sireCode: "ＬＤＫ", apptTime: "7:30", kind: "新", zone: "第2種付所" }),
  newMare({ mareName: "ドロミティ", farm: "村上欽哉牧場", sireCode: "ＤＦＯ", apptTime: "", kind: "新", zone: "保留・処置", tags: ["直検"] }),
  newMare({ mareName: "フルーリア", farm: "ノースヒルズ", sireCode: "ＫＺＮ", apptTime: "", kind: "新", zone: "帰宅" }),
];
