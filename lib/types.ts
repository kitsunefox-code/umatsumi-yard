// 馬積み駐車場管理アプリ 型定義

export type UnloadStatus = "not_unloaded" | "unloading" | "unloaded";
export type FoalSex = "オス" | "メス" | "不明";
export type UnloadType = "single" | "double"; // 1頭ずつ / 2頭OK

export type Horse = {
  id: string;
  horseCode: string; // 繁殖牝馬のコード
  horseName?: string;
  isBroodmare: boolean; // 常に true（全馬 繁殖牝馬）
  foalBirthDate?: string; // 例: "1/25"、"不明"
  foalSex?: FoalSex;
  from?: string; // どこから来たか
  memo?: string;
  unloadStatus: UnloadStatus;
};

export type Vehicle = {
  id: string;
  parkingNo: number | null; // 予備スペースは null
  vehicleCode: string;
  unloadType?: UnloadType; // 旧: single/double（互換用）
  unloadBatch?: number; // 同時に降ろせる頭数（1=1頭ずつ, 2=2頭同時, 3=3頭同時）
  memo?: string;
  horses: Horse[];
  reserve?: boolean; // 予備スペースに置くか
  arrivedAt?: string; // 到着（例: "7/4 8:10"）
  arrivedTs?: number; // 到着時刻（ミリ秒。滞在時間の警告用）
  wentHome?: boolean; // 帰宅済み（全馬降ろし後に帰宅）
  departedAt?: string; // 帰宅時刻
};

// 競馬の枠番ルール：馬番(uma)と出走頭数(total)から枠番(1〜8)を求める。
// 8頭以下は馬番=枠番。9頭以上は8枠に振り分け、余りは大きい枠から2頭ずつ。
export function wakuNoOf(uma: number, total: number): number {
  const N = Math.max(1, total);
  if (N <= 8) return Math.min(Math.max(uma, 1), 8);
  const base = Math.floor(N / 8);
  const rem = N % 8;
  let cum = 0;
  for (let k = 1; k <= 8; k++) {
    cum += base + (k > 8 - rem ? 1 : 0); // 大きい枠から+1頭
    if (uma <= cum) return k;
  }
  return 8;
}

// 枠色クラス（駐車枠=馬番、出走頭数totalの枠番で色分け。既定は15枠立て）
export function wakuClass(
  n: number | null | undefined,
  total = 15
): string {
  if (n == null) return "";
  return `waku-${wakuNoOf(n, total)}`;
}

// 同時に降ろせる頭数（頭数でキャップ、旧unloadTypeからも推定）
export function effBatch(v: Vehicle): number {
  const count = v.horses.length;
  if (count === 0) return 1;
  const raw =
    v.unloadBatch ?? (v.unloadType === "double" ? 2 : count);
  return Math.max(1, Math.min(count, raw));
}

export type YardData = {
  vehicles: Vehicle[];
};

export const UNLOAD_STATUS_LABEL: Record<UnloadStatus, string> = {
  not_unloaded: "未降ろし",
  unloading: "降ろし中",
  unloaded: "降ろした",
};

export const UNLOAD_TYPE_LABEL: Record<UnloadType, string> = {
  single: "1頭ずつ",
  double: "2頭OK",
};
