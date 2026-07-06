// 所在ボード（種付当日の牝馬が今どこにいるか）のデータ定義
import { genId } from "./storage";

// 場所（ゾーン）：実際の配置図どおり
export const ZONES = [
  "馬積場",
  "予備（馬積）",
  "洗い場",
  "待機馬房",
  "待機",
  "第一種付所",
  "第二種付所",
  "P検待ち・直検待ち",
  "鎮静待ち",
  "帰宅",
] as const;
export type Zone = (typeof ZONES)[number];

// 状態タグ（待機の補足）
export const MARE_TAGS = ["種付出来ず待機"] as const;
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
  rosterId?: string; // 元の予定（順番表）のID
  isNew?: boolean; // 進行中に追加された予定（NEW表示）
  frameNo?: number; // 馬積場の枠番号（1〜15）
  parkingRef?: string; // 連携元の馬積みの馬（vehicleId:horseId）。二重表示防止用
  note?: string; // 順番表の注記（上り・鎮静※・指定 昼ＫＺＮ など）
  enteredTs?: number; // 馬積場到着（滞在時間の起点。ms）
  matedAt?: string; // 入った種付所（第一種付所 / 第二種付所）
  departedTs?: number; // 帰宅時刻（ms）
  treats?: string[]; // 処置タグ（促進剤 / ピン止め / 陰部チェック）
};

// 滞在時間の注意しきい値（分）
export const STAY_WARN_MIN = 60;
// 起点tsからの滞在（分）。tsが無ければ null
export function stayMinutes(ts?: number, now?: number): number | null {
  if (!ts || !now) return null;
  return Math.floor((now - ts) / 60000);
}

// 順番表（本日の予定）の1件
export type RosterEntry = {
  id: string;
  mareName: string; // 牝馬名
  sireCode: string; // 交配する父（種牡馬）コード
  farm?: string; // 牧場
  kind?: "新" | "再" | ""; // 新/再
  apptTime?: string; // 予定時間
  arrived: boolean; // 馬積場に到着してボードに出したか
  isNew?: boolean; // 取り込み後に追加された（NEW表示）
  note?: string; // 順番表の注記（上り・鎮静※・指定 昼ＫＺＮ など）
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

// 父コード比較用に正規化（全角/半角・大小・空白を無視）
export function normCode(s: string): string {
  return (s || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/\s/g, "")
    .toUpperCase();
}

// 進める先（ワンタップ移動）。label=ボタン表示、to=移動先(無ければ移動せずタグのみ)、treat=処置タグ
export type Move = { label: string; to?: Zone; treat?: string };

const MATE_MOVES: Move[] = [
  { label: "促進剤", treat: "促進剤" }, // タグのみ（移動しない）
  { label: "ピン止め", treat: "ピン止め" }, // タグのみ
  { label: "陰部チェック", to: "洗い場", treat: "陰部チェック" },
  { label: "待機馬房", to: "待機馬房" },
  { label: "鎮静待ち", to: "鎮静待ち" },
  { label: "P検待ち・直検待ち", to: "P検待ち・直検待ち" },
  { label: "帰宅", to: "帰宅" },
];

const ZONE_MOVES: Partial<Record<Zone, Move[]>> = {
  "予備（馬積）": [
    { label: "洗い場", to: "洗い場" },
    { label: "待機馬房", to: "待機馬房" },
  ],
  "洗い場": [
    { label: "待機", to: "待機" },
    { label: "待機馬房", to: "待機馬房" },
  ],
  "待機馬房": [
    { label: "待機", to: "待機" },
    { label: "洗い場", to: "洗い場" },
    { label: "帰宅", to: "帰宅" },
  ],
  "待機": [
    { label: "第一種付所", to: "第一種付所" },
    { label: "第二種付所", to: "第二種付所" },
  ],
  "第一種付所": [{ label: "第二種付所", to: "第二種付所" }, ...MATE_MOVES],
  "第二種付所": [{ label: "第一種付所", to: "第一種付所" }, ...MATE_MOVES],
  "P検待ち・直検待ち": [
    { label: "第一種付所", to: "第一種付所" },
    { label: "第二種付所", to: "第二種付所" },
    { label: "帰宅", to: "帰宅" },
  ],
  "鎮静待ち": [
    { label: "第一種付所", to: "第一種付所" },
    { label: "第二種付所", to: "第二種付所" },
    { label: "帰宅", to: "帰宅" },
  ],
};
export function zoneMoves(z: Zone): Move[] {
  return ZONE_MOVES[z] ?? [];
}

// 注記の種類でスタイル分け（上り=赤/上り再発=青/鎮静=黄△!/OV=紫）
export function noteKind(note?: string): string {
  if (!note) return "";
  if (note.includes("鎮静")) return "sedate";
  if (note.includes("上り再発") || note.includes("再発")) return "agari-re";
  if (note.includes("上り")) return "agari";
  if (note.includes("OV")) return "ov";
  return "other";
}
// カード全体を色付けする注記かどうか（上り/上り再発/鎮静）
export function cardClass(note?: string): string {
  const k = noteKind(note);
  return k === "agari" || k === "agari-re" || k === "sedate"
    ? `card-${k}`
    : "";
}

// 父コード（種牡馬）→ 本日の予定の牝馬名を照合（無ければ空）
export function resolveMareName(
  roster: RosterEntry[],
  code: string
): string {
  const c = normCode(code);
  return roster.find((r) => normCode(r.sireCode) === c)?.mareName ?? "";
}
// 父コード → 順番表の注記（上り・鎮静など）を照合
export function resolveNote(roster: RosterEntry[], code: string): string {
  const c = normCode(code);
  return roster.find((r) => normCode(r.sireCode) === c)?.note ?? "";
}

// 馬積場の空いている最小の枠番号（1〜15）
export function firstFreeFrame(mares: Mare[]): number | undefined {
  const used = new Set(
    mares.filter((m) => m.zone === "馬積場" && m.frameNo).map((m) => m.frameNo)
  );
  for (let n = 1; n <= 15; n++) if (!used.has(n)) return n;
  return undefined;
}

// 予定→牝馬カード
export function mareFromRoster(e: RosterEntry, zone: Zone = "馬積場"): Mare {
  return newMare({
    mareName: e.mareName,
    sireCode: e.sireCode,
    farm: e.farm ?? "",
    apptTime: e.apptTime ?? "",
    kind: e.kind ?? "",
    zone,
    rosterId: e.id,
    isNew: e.isNew,
  });
}

// 本日の予定（順番表 8:00の組サンプル）
export const roster8Sample: RosterEntry[] = [
  { id: "r-kbl", mareName: "エジプシャンストーム", sireCode: "ＫＢＬ", farm: "ヤナガワ牧場", kind: "新", apptTime: "7:30", arrived: true },
  { id: "r-eqx", mareName: "ネバーギブアップ", sireCode: "ＥＱＸ", farm: "服部牧場", kind: "再", apptTime: "7:30", arrived: true },
  { id: "r-kzn", mareName: "ラブインジエア", sireCode: "ＫＺＮ", farm: "千代田牧場", kind: "新", apptTime: "", arrived: true },
  { id: "r-dfo", mareName: "ドロミティ", sireCode: "ＤＦＯ", farm: "村上欽哉牧場", kind: "新", apptTime: "8:30", arrived: true },
  { id: "r-ldk", mareName: "アートハウス", sireCode: "ＬＤＫ", farm: "", kind: "新", apptTime: "7:30", arrived: false },
  { id: "r-orf", mareName: "モンゴリアンチャンガ", sireCode: "ＯＲＦ", farm: "", kind: "新", apptTime: "7:45", arrived: false, isNew: true },
  { id: "r-rey", mareName: "チェルビック", sireCode: "ＲＥＹ", farm: "丸善橋本牧場", kind: "再", apptTime: "8:15", arrived: false, note: "OV" },
  { id: "r-dfo2", mareName: "セレッソブランコ", sireCode: "ＧＤＧ", farm: "天羽禮治牧場", kind: "新", apptTime: "8:30", arrived: false },
  { id: "r-mau", mareName: "ダブルイプシロン", sireCode: "ＭＡＵ", farm: "奥山Ｆ", kind: "再", apptTime: "8:30", arrived: false },
  { id: "r-bop", mareName: "ルクスドヌーヴ", sireCode: "ＢＯＰ", farm: "いとう牧場", kind: "新", apptTime: "8:30", arrived: false, note: "上り再発" },
  { id: "r-stn", mareName: "ヴィアフィレンツェ", sireCode: "ＳＴＮ", farm: "", kind: "新", apptTime: "8:45", arrived: false },
  { id: "r-poe", mareName: "ハルワタート", sireCode: "ＰＯＥ", farm: "", kind: "新", apptTime: "8:45", arrived: false },
  { id: "r-con", mareName: "テイハ", sireCode: "ＣＯＮ", farm: "", kind: "新", apptTime: "9:00", arrived: false, note: "鎮静" },
  { id: "r-shy", mareName: "ウィラビーオーサム", sireCode: "ＳＨＹ", farm: "", kind: "新", apptTime: "9:00", arrived: false },
  { id: "r-hrc", mareName: "エスキモーキセス", sireCode: "ＨＲＣ", farm: "", kind: "新", apptTime: "9:00", arrived: false },
  { id: "r-epn", mareName: "グランドマルク", sireCode: "ＥＰＮ", farm: "", kind: "新", apptTime: "9:15", arrived: false, note: "上り" },
  { id: "r-ndl", mareName: "チェエヴァソラ", sireCode: "ＮＤＬ", farm: "アシュリンジャパン", kind: "新", apptTime: "", arrived: false },
  { id: "r-efo", mareName: "ベルフィオーレ", sireCode: "ＥＦＯ", farm: "ケイアイＦ", kind: "新", apptTime: "", arrived: false },
  { id: "r-lvl", mareName: "シゲルチャグチャグ", sireCode: "ＬＶＬ", farm: "コスモヴューＦ", kind: "再", apptTime: "", arrived: false },
  { id: "r-sis", mareName: "スカイラー", sireCode: "ＳＩＳ", farm: "高橋Ｆ", kind: "新", apptTime: "", arrived: false },
];

// 見本データ：流れの馬は最初は空（馬積場は馬積みアプリから反映、進めると流れに入る）
export const sampleMares: Mare[] = [];
