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
// 勝負服の基本色パレット
const C = {
  navy: "#0050a0", blue: "#2850c8", lblue: "#78c8f0", red: "#c80028",
  dred: "#9c2632", green: "#28a050", teal: "#4aa0a0", purple: "#7850a0",
  pink: "#d070b0", yellow: "#e0d000", black: "#1e1e1e", brown: "#9c6a3c",
  gray: "#5a5a5a", white: "#eaeaea", lgreen: "#74b48c", orange: "#e07820",
};
// 勝負服（勝負服.xlsx）から抽出した種牡馬の色。[主色, 副色|null]。
// 副色があるものだけ2色（左斜め＼で分割）、なければ1色。
const SILK: Record<string, [string, string | null]> = {
  AMS: [C.navy, C.lblue],
  ISB: [C.black, C.yellow],
  KBL: [C.black, C.brown],
  SCW: [C.green, C.yellow],
  SIS: [C.teal, null],
  NDL: [C.navy, C.yellow],
  POE: [C.purple, null],
  HRC: [C.green, C.black],
  LDK: [C.navy, C.white],
  // 水色＋赤（ノースヒルズ）
  CON: [C.lblue, C.red],
  KZN: [C.lblue, C.red],
  // 水色
  EQX: [C.lblue, null],
  SAO: [C.lblue, null],
  // 緑
  EPN: [C.green, null],
  EFO: [C.green, null],
  STN: [C.green, null],
  REY: [C.green, null],
  CRS: [C.green, C.red],
  // 赤
  ORF: [C.red, null],
  GDG: [C.red, null],
  SHY: [C.red, null],
  SMR: [C.red, null],
  RSP: [C.red, null],
  DKG: [C.red, null],
  // 黒
  LVL: [C.black, null],
  MYB: [C.black, C.dred],
  // 赤＋黄
  BOP: [C.red, C.yellow],
  // 黄
  MAU: [C.yellow, null],
  // 単色
  DFO: [C.navy, null],
  DDC: [C.gray, null],
  SVR: [C.dred, null],
};
// 主色が2頭以上で被っている色だけ2色分割して区別する（被ってなければ1色）
const SILK_PRIMARY_COUNT: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const k in SILK) m[SILK[k][0]] = (m[SILK[k][0]] || 0) + 1;
  return m;
})();
export function sireColor(code: string): string {
  const c = normCode(code);
  if (SILK[c]) return SILK[c][0];
  let h = 0;
  for (const ch of code || "?") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SIRE_PALETTE[h % SIRE_PALETTE.length];
}
// 背景色に対して読みやすい文字色（明るい服は黒字）
export function sireTextColor(bg: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(bg)) return "#fff";
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1a1a1a" : "#fff";
}
// 種牡馬バッジの背景・文字色（2色服は左斜め＼で半分に分割＋文字影）
export function sireBadge(code: string): {
  background: string;
  color: string;
  twoTone: boolean;
} {
  const c = normCode(code);
  const s = SILK[c];
  if (s && s[1] && SILK_PRIMARY_COUNT[s[0]] > 1) {
    // 45deg = 左斜め＼（左下＝主色 / 右上＝副色）
    return {
      background: `linear-gradient(45deg, ${s[0]} 0 50%, ${s[1]} 50% 100%)`,
      color: "#fff",
      twoTone: true,
    };
  }
  const bg = sireColor(code);
  return { background: bg, color: sireTextColor(bg), twoTone: false };
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
  { id: "r-ldk", mareName: "アートハウス", sireCode: "ＬＤＫ", farm: "ＮＦ", kind: "新", apptTime: "7:30", arrived: false },
  { id: "r-orf", mareName: "モンゴリアンチャンガ", sireCode: "ＯＲＦ", farm: "ＮＦ", kind: "新", apptTime: "7:45", arrived: false, isNew: true },
  { id: "r-rey", mareName: "チェルビック", sireCode: "ＲＥＹ", farm: "丸善橋本牧場", kind: "再", apptTime: "8:15", arrived: false, note: "OV" },
  { id: "r-dfo2", mareName: "セレッソブランコ", sireCode: "ＧＤＧ", farm: "天羽禮治牧場", kind: "新", apptTime: "8:30", arrived: false },
  { id: "r-mau", mareName: "ダブルイプシロン", sireCode: "ＭＡＵ", farm: "奥山Ｆ", kind: "再", apptTime: "8:30", arrived: false },
  { id: "r-bop", mareName: "ルクスドヌーヴ", sireCode: "ＢＯＰ", farm: "いとう牧場", kind: "新", apptTime: "8:30", arrived: false, note: "上り再発" },
  { id: "r-stn", mareName: "ヴィアフィレンツェ", sireCode: "ＳＴＮ", farm: "ＮＦ", kind: "新", apptTime: "8:45", arrived: false },
  { id: "r-poe", mareName: "ハルワタート", sireCode: "ＰＯＥ", farm: "ＳＦ", kind: "新", apptTime: "8:45", arrived: false },
  { id: "r-con", mareName: "テイハ", sireCode: "ＣＯＮ", farm: "ＮＦ", kind: "新", apptTime: "9:00", arrived: false, note: "鎮静" },
  { id: "r-shy", mareName: "ウィラビーオーサム", sireCode: "ＳＨＹ", farm: "ＮＦ", kind: "新", apptTime: "9:00", arrived: false },
  { id: "r-hrc", mareName: "エスキモーキセス", sireCode: "ＨＲＣ", farm: "ＳＦ", kind: "新", apptTime: "9:00", arrived: false },
  { id: "r-epn", mareName: "グランドマルク", sireCode: "ＥＰＮ", farm: "ＳＦ", kind: "新", apptTime: "9:15", arrived: false, note: "上り" },
  { id: "r-ndl", mareName: "チェエヴァソラ", sireCode: "ＮＤＬ", farm: "アシュリンジャパン", kind: "新", apptTime: "", arrived: false },
  { id: "r-efo", mareName: "ベルフィオーレ", sireCode: "ＥＦＯ", farm: "ケイアイＦ", kind: "新", apptTime: "", arrived: false },
  { id: "r-lvl", mareName: "シゲルチャグチャグ", sireCode: "ＬＶＬ", farm: "コスモヴューＦ", kind: "再", apptTime: "", arrived: false },
  { id: "r-sis", mareName: "スカイラー", sireCode: "ＳＩＳ", farm: "高橋Ｆ", kind: "新", apptTime: "", arrived: false },
];

// 昼（13:00）の組
export const roster13Sample: RosterEntry[] = [
  { id: "r13-kbl", mareName: "ワグニス", sireCode: "ＫＢＬ", farm: "ＮＦ", kind: "新", apptTime: "12:45", arrived: false },
  { id: "r13-eqx", mareName: "コミッショニング", sireCode: "ＥＱＸ", farm: "ＮＦ", kind: "再", apptTime: "12:45", arrived: false },
  { id: "r13-kzn", mareName: "フルーリア", sireCode: "ＫＺＮ", farm: "ノースヒルズ", kind: "新", apptTime: "", arrived: false },
  { id: "r13-ddc", mareName: "プリモシーン", sireCode: "ＤＤＣ", farm: "ＮＦ", kind: "再", apptTime: "12:45", arrived: false },
  { id: "r13-stn", mareName: "タンザニアブラック", sireCode: "ＳＴＮ", farm: "前川勝春", kind: "新", apptTime: "13:45", arrived: false },
  { id: "r13-dfo", mareName: "キャリックアリード", sireCode: "ＤＦＯ", farm: "ＮＦ", kind: "再", apptTime: "", arrived: false },
  { id: "r13-ndl", mareName: "クローリスノキセキ", sireCode: "ＮＤＬ", farm: "岡田牧場", kind: "新", apptTime: "12:45", arrived: false },
  { id: "r13-mau", mareName: "シングルハーテッド", sireCode: "ＭＡＵ", farm: "ＮＦ", kind: "新", apptTime: "13:45", arrived: false },
  { id: "r13-ams", mareName: "インディゴブルー", sireCode: "ＡＭＳ", farm: "奥山Ｆ", kind: "新", apptTime: "13:30", arrived: false },
  { id: "r13-efo", mareName: "オパールムーン", sireCode: "ＥＦＯ", farm: "ＢｌｏｏｍｉｎｇＦ", kind: "新", apptTime: "", arrived: false },
  { id: "r13-lvl", mareName: "クリストフォリ", sireCode: "ＬＶＬ", farm: "奥山Ｆ", kind: "新", apptTime: "", arrived: false },
  { id: "r13-sis", mareName: "ポールネイロン", sireCode: "ＳＩＳ", farm: "ノースヒルズ", kind: "新", apptTime: "13:30", arrived: false },
  { id: "r13-bop", mareName: "ベネフィット", sireCode: "ＢＯＰ", farm: "ナカノＦ", kind: "新", apptTime: "13:30", arrived: false },
  { id: "r13-rey", mareName: "ガートルード", sireCode: "ＲＥＹ", farm: "三村卓也", kind: "新", apptTime: "", arrived: false },
  { id: "r13-gdg", mareName: "マーブルサニー", sireCode: "ＧＤＧ", farm: "丸村村下Ｆ", kind: "新", apptTime: "13:30", arrived: false },
  { id: "r13-poe", mareName: "メモリーレゾン", sireCode: "ＰＯＥ", farm: "谷川牧場", kind: "新", apptTime: "13:30", arrived: false },
];

// 夕（17:00）の組
export const roster17Sample: RosterEntry[] = [
  { id: "r17-kbl", mareName: "グレイスフル", sireCode: "ＫＢＬ", farm: "坂東牧場", kind: "新", apptTime: "16:45", arrived: false },
  { id: "r17-eqx", mareName: "ポウリナズラヴ", sireCode: "ＥＱＸ", farm: "パカパカＦ", kind: "新", apptTime: "16:45", arrived: false },
  { id: "r17-kzn", mareName: "マーゴットディド", sireCode: "ＫＺＮ", farm: "ＮＦ", kind: "新", apptTime: "", arrived: false },
  { id: "r17-ldk", mareName: "コンクシェル", sireCode: "ＬＤＫ", farm: "ノースヒルズ", kind: "新", apptTime: "16:30", arrived: false },
  { id: "r17-ddc", mareName: "ティケイプルメリア", sireCode: "ＤＤＣ", farm: "モリナガＦ", kind: "新", apptTime: "16:40", arrived: false },
  { id: "r17-dfo", mareName: "ファナティック", sireCode: "ＤＦＯ", farm: "天羽禮治牧場", kind: "新", apptTime: "", arrived: false },
  { id: "r17-ams", mareName: "トーホウラビアン", sireCode: "ＡＭＳ", farm: "吉田Ｆ", kind: "新", apptTime: "", arrived: false },
  { id: "r17-efo", mareName: "ナオミエキスプレス", sireCode: "ＥＦＯ", farm: "ヒダカＦ", kind: "再", apptTime: "", arrived: false },
  { id: "r17-lvl", mareName: "モディカ", sireCode: "ＬＶＬ", farm: "ＮＦ", kind: "新", apptTime: "", arrived: false },
  { id: "r17-hrc", mareName: "ホローポ", sireCode: "ＨＲＣ", farm: "長谷川牧場", kind: "新", apptTime: "16:30", arrived: false },
];

// 時間帯の組（朝/昼/夕）
export type GroupKey = "朝" | "昼" | "夕";
export const ROSTER_GROUPS: { key: GroupKey; time: string; mares: RosterEntry[] }[] = [
  { key: "朝", time: "8:00", mares: roster8Sample },
  { key: "昼", time: "13:00", mares: roster13Sample },
  { key: "夕", time: "17:00", mares: roster17Sample },
];
export function groupRoster(g: GroupKey): RosterEntry[] {
  return (ROSTER_GROUPS.find((x) => x.key === g) ?? ROSTER_GROUPS[0]).mares;
}

// 見本データ：流れの馬は最初は空（馬積場は馬積みアプリから反映、進めると流れに入る）
export const sampleMares: Mare[] = [];
