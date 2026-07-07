// 担当者テスト.xlsx から抽出した厩舎レイアウト（種牡馬・担当者・馬房位置）
// col/row は Excel のセル位置。隣・正面・斜めの判定に使う。
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
  SHY: "シャフリヤール", ORF: "オルフェーヴル", MYB: "マインドユアビスケッツ",
  DJY: "ドリームジャーニー", HBG: "ハービンジャー",
};

export const STALLIONS: Stallion[] = [
  { code: "KZN", groom: "筒井(登石)", col: 10, row: 24, barn: "第1厩舎" },
  { code: "CON", groom: "筒井", col: 14, row: 24, barn: "第1厩舎" },
  { code: "REY", groom: "遠藤", col: 18, row: 24, barn: "第1厩舎" },
  { code: "MAU", groom: "祐輔", col: 30, row: 24, barn: "第1厩舎" },
  { code: "KBL", groom: "松田", col: 10, row: 30, barn: "第1厩舎" },
  { code: "STN", groom: "祐輔", col: 14, row: 30, barn: "第1厩舎" },
  { code: "DDC", groom: "一幸", col: 18, row: 30, barn: "第1厩舎" },
  { code: "EPN", groom: "東家", col: 22, row: 30, barn: "第1厩舎" },
  { code: "LDK", groom: "祐輔", col: 30, row: 30, barn: "第1厩舎" },
  { code: "AMS", groom: "山崎", col: 3, row: 39, barn: "第2厩舎" },
  { code: "BOP", groom: "祐輔", col: 8, row: 39, barn: "第2厩舎" },
  { code: "GDG", groom: "遠藤", col: 3, row: 43, barn: "第2厩舎" },
  { code: "HRC", groom: "瑞音", col: 8, row: 43, barn: "第2厩舎" },
  { code: "DFO", groom: "星", col: 24, row: 9, barn: "第3厩舎" },
  { code: "NDL", groom: "永宮", col: 29, row: 9, barn: "第3厩舎" },
  { code: "EFO", groom: "永宮", col: 24, row: 15, barn: "第3厩舎" },
  { code: "SVR", groom: "謙至", col: 29, row: 15, barn: "第3厩舎" },
  { code: "SAO", groom: "原", col: 11, row: 5, barn: "第4厩舎" },
  { code: "ISB", groom: "山崎", col: 15, row: 5, barn: "第4厩舎" },
  { code: "SIS", groom: "赤星", col: 19, row: 5, barn: "第4厩舎" },
  { code: "SMR", groom: "一幸", col: 3, row: 47, barn: "第5厩舎" },
  { code: "CRS", groom: "赤星", col: 8, row: 47, barn: "第5厩舎" },
  { code: "DJY", groom: "", col: 22, row: 47, barn: "第5厩舎" },
  { code: "POE", groom: "原", col: 26, row: 47, barn: "第5厩舎" },
  { code: "HBG", groom: "", col: 30, row: 47, barn: "第5厩舎" },
  { code: "EQX", groom: "永宮", col: 3, row: 51, barn: "第5厩舎" },
  { code: "SCW", groom: "瑞音", col: 22, row: 53, barn: "第5厩舎" },
  { code: "DKG", groom: "赤星", col: 26, row: 53, barn: "第5厩舎" },
  { code: "RSP", groom: "東家", col: 30, row: 53, barn: "第5厩舎" },
  { code: "LVL", groom: "謙至", col: 3, row: 55, barn: "第5厩舎" },
  { code: "SHY", groom: "原", col: 8, row: 55, barn: "第5厩舎" },
  { code: "ORF", groom: "謙至", col: 3, row: 59, barn: "第5厩舎" },
  { code: "MYB", groom: "謙至", col: 8, row: 59, barn: "第5厩舎" },
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

// 馬房が「隣・正面・斜め」か（同じ厩舎内で横5・縦6以内なら隣接とみなす）
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
