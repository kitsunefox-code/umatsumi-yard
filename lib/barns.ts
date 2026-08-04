// テスト　担当.xlsx / 放牧地図.xls「馬房一覧・種付け担当」(26/7/24現在) から作った厩舎レイアウト。
// col/row は担当表シートのセル位置。隣・正面・斜めの判定に使う。
import { normCode } from "./board";

export type Stallion = {
  code: string;
  name: string;
  groom: string; // 担当者（グルーム）
  barn: string; // 厩舎
  col: number; // 馬房の横位置（Excel列番号）
  row: number; // 馬房の縦位置（Excel行番号）
};

export const CODE2NAME: Record<string, string> = {
  SAO: "サリオス", ISB: "イスラボニータ", SIS: "シスキン", DFO: "ドレフォン",
  NDL: "ナダル", EFO: "エフフォーリア", SVR: "スワーヴリチャード", KZN: "キズナ",
  CON: "コントレイル", REY: "レイデオロ", MAU: "モーリス", KBL: "キタサンブラック",
  STN: "サートゥルナーリア", DDC: "ドウデュース", EPN: "エピファネイア", LDK: "ロードカナロア",
  AMS: "アドマイヤマーズ", BOP: "ベラジオオペラ", GDG: "グレナディアガーズ", HRC: "ホットロッドチャーリー",
  SMR: "シュネルマイスター", CRS: "クリソベリル", POE: "ポエティックフレア", EQX: "イクイノックス",
  SCW: "サトノクラウン", DKG: "ダノンキングリー", RSP: "ルーラーシップ", LVL: "ルヴァンスレーヴ",
  SHY: "シャフリヤール", ORF: "オルフェーヴル",
  JTM: "ジャンタルマンタル",
  // 退厩・引退（過去データの表示用に名前だけ残す）
  MYB: "マインドユアビスケッツ", DJY: "ドリームジャーニー", HBG: "ハービンジャー",
};

// 26/7/24現在の繋養馬（29頭）。
// マインドユアビスケッツは退厩、ドリームジャーニー・ハービンジャーは引退のため除外。
// ジャンタルマンタル新入り(順番表未登場のためコードは仮でJTM)。
export const STALLIONS: Stallion[] = [
  // 第4厩舎（1列）
  { code: "SAO", groom: "原", col: 11, row: 5, barn: "第4厩舎" },
  { code: "ISB", groom: "山崎", col: 15, row: 5, barn: "第4厩舎" },
  { code: "SIS", groom: "赤星", col: 19, row: 5, barn: "第4厩舎" },
  // 第3厩舎（2×2）
  { code: "DFO", groom: "星", col: 24, row: 9, barn: "第3厩舎" },
  { code: "NDL", groom: "永宮", col: 29, row: 9, barn: "第3厩舎" },
  { code: "EFO", groom: "永宮", col: 24, row: 15, barn: "第3厩舎" },
  { code: "SVR", groom: "謙至", col: 29, row: 15, barn: "第3厩舎" },
  // 第1厩舎（2×6・上段4番目と下段5番目は空馬房）
  { code: "KZN", groom: "筒井(登石)", col: 10, row: 24, barn: "第1厩舎" },
  { code: "CON", groom: "筒井", col: 14, row: 24, barn: "第1厩舎" },
  { code: "REY", groom: "遠藤", col: 18, row: 24, barn: "第1厩舎" },
  { code: "JTM", groom: "祐輔", col: 26, row: 24, barn: "第1厩舎" },
  { code: "MAU", groom: "祐輔", col: 30, row: 24, barn: "第1厩舎" },
  { code: "KBL", groom: "松田", col: 10, row: 30, barn: "第1厩舎" },
  { code: "STN", groom: "祐輔", col: 14, row: 30, barn: "第1厩舎" },
  { code: "DDC", groom: "一幸", col: 18, row: 30, barn: "第1厩舎" },
  { code: "EPN", groom: "東家", col: 22, row: 30, barn: "第1厩舎" },
  { code: "LDK", groom: "祐輔", col: 30, row: 30, barn: "第1厩舎" },
  // 第2厩舎（左列 C/H の縦6段。馬房一覧の「第2厩舎」ラベルはC38＝この列の頭）
  { code: "AMS", groom: "山崎", col: 3, row: 39, barn: "第2厩舎" },
  { code: "BOP", groom: "瑞音", col: 8, row: 39, barn: "第2厩舎" },
  { code: "GDG", groom: "遠藤", col: 3, row: 43, barn: "第2厩舎" },
  { code: "HRC", groom: "瑞音", col: 8, row: 43, barn: "第2厩舎" },
  { code: "SMR", groom: "一幸", col: 3, row: 47, barn: "第2厩舎" },
  { code: "CRS", groom: "赤星", col: 8, row: 47, barn: "第2厩舎" },
  { code: "EQX", groom: "永宮", col: 3, row: 51, barn: "第2厩舎" },
  { code: "LVL", groom: "謙至", col: 3, row: 55, barn: "第2厩舎" },
  { code: "SHY", groom: "原", col: 8, row: 55, barn: "第2厩舎" },
  { code: "ORF", groom: "謙至", col: 3, row: 59, barn: "第2厩舎" },
  // 第5厩舎（右列 V/Z/AD の2段×3列。ラベルはV46＝この区画の頭）
  // ドリームジャーニー・ハービンジャーは引退のため空馬房
  { code: "POE", groom: "原", col: 26, row: 47, barn: "第5厩舎" },
  { code: "SCW", groom: "瑞音", col: 22, row: 53, barn: "第5厩舎" },
  { code: "DKG", groom: "赤星", col: 26, row: 53, barn: "第5厩舎" },
  { code: "RSP", groom: "東家", col: 30, row: 53, barn: "第5厩舎" },
].map((s) => ({ ...s, name: CODE2NAME[s.code] || s.code }));

const BY_CODE: Record<string, Stallion> = {};
for (const s of STALLIONS) BY_CODE[s.code] = s;

export function stallion(code: string): Stallion | undefined {
  return BY_CODE[normCode(code)];
}
export function stallionName(code: string): string {
  return CODE2NAME[normCode(code)] || code;
}
export function groomOf(code: string): string {
  // 「筒井(登石)」は「筒井」と同一人物として扱う（括弧内を除去）
  const g = BY_CODE[normCode(code)]?.groom || "";
  return g.replace(/[（(].*?[）)]/g, "").trim();
}
export function barnOf(code: string): string {
  return BY_CODE[normCode(code)]?.barn || "";
}

// 馬房が「隣・正面・斜め」か（同じ厩舎内で横5・縦6以内なら隣接とみなす。
// 空馬房を1つ挟むと横8以上になり隣接扱いにならない）
const COL_TOL = 5;
const ROW_TOL = 6;
export function adjacentStalls(codeA: string, codeB: string): boolean {
  const a = stallion(codeA);
  const b = stallion(codeB);
  if (!a || !b || a.code === b.code) return false;
  if (a.barn !== b.barn) return false;
  return Math.abs(a.col - b.col) <= COL_TOL && Math.abs(a.row - b.row) <= ROW_TOL;
}

// 2頭を同時に種付できない理由（無ければ null）
// 「担当者が同じ」＝第一種付所と第二種付所に同じ担当の種馬を入れない
export function concurrentConflict(
  codeA: string,
  codeB: string
): "same" | "groom" | "stall" | null {
  const a = normCode(codeA);
  const b = normCode(codeB);
  if (a === b) return "same";
  const ga = groomOf(a);
  const gb = groomOf(b);
  if (ga && gb && ga === gb) return "groom";
  if (adjacentStalls(a, b)) return "stall";
  return null;
}

export const BARNS = ["第1厩舎", "第2厩舎", "第3厩舎", "第4厩舎", "第5厩舎"];

// 厩舎マップの実レイアウト（担当表の配置どおり。null=空馬房）。
// 各厩舎は複数ブロック（第5厩舎は西と東で離れている）
export const BARN_LAYOUT: {
  barn: string;
  blocks: (string | null)[][][];
}[] = [
  {
    barn: "第1厩舎",
    blocks: [
      [
        ["KZN", "CON", "REY", null, "JTM", "MAU"],
        ["KBL", "STN", "DDC", "EPN", null, "LDK"],
      ],
    ],
  },
  {
    barn: "第2厩舎",
    blocks: [
      [
        ["AMS", "BOP"],
        ["GDG", "HRC"],
        ["SMR", "CRS"],
        ["EQX", null],
        ["LVL", "SHY"],
        ["ORF", null],
      ],
    ],
  },
  {
    barn: "第3厩舎",
    blocks: [
      [
        ["DFO", "NDL"],
        ["EFO", "SVR"],
      ],
    ],
  },
  {
    barn: "第4厩舎",
    blocks: [[["SAO", "ISB", "SIS"]]],
  },
  {
    barn: "第5厩舎",
    blocks: [
      [
        // ドリームジャーニー・ハービンジャーは引退のため空馬房
        [null, "POE", null],
        ["SCW", "DKG", "RSP"],
      ],
    ],
  },
];
