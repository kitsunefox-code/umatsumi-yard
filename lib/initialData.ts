import { Vehicle } from "./types";

// サンプルの到着時刻（ロード時刻からの相対。警告デモ用）
function arr(minAgo: number): { at: string; ts: number } {
  const ts = Date.now() - minAgo * 60000;
  const d = new Date(ts);
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { at: `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${mm}`, ts };
}
const arrMau = arr(40); // 40分前・未降ろし → 警告
const arrHrc = arr(12); // 12分前
const arrKzn = arr(50); // 50分前だが降ろし済み → 警告なし

// 元Excel「馬積テスト.xlsx」の内容を再現した初期データ
// 駐車3=MAU(2頭OK), 駐車2=HRC(1頭ずつ), 駐車1=KZN(降ろした)
export const initialVehicles: Vehicle[] = [
  {
    id: "vehicle-3",
    parkingNo: 3,
    vehicleCode: "MAU",
    unloadBatch: 2,
    memo: "",
    arrivedAt: arrMau.at,
    arrivedTs: arrMau.ts,
    horses: [
      {
        id: "horse-eqx",
        horseCode: "EQX",
        horseName: "EQX",
        isBroodmare: true,
        foalBirthDate: "1/25",
        foalSex: "オス",
        from: "RST",
        memo: "RSTより",
        unloadStatus: "not_unloaded",
      },
      {
        id: "horse-kzn-2",
        horseCode: "KZN",
        horseName: "KZN",
        isBroodmare: true,
        unloadStatus: "not_unloaded",
      },
    ],
  },
  {
    id: "vehicle-2",
    parkingNo: 2,
    vehicleCode: "HRC",
    unloadBatch: 1,
    memo: "",
    arrivedAt: arrHrc.at,
    arrivedTs: arrHrc.ts,
    horses: [
      {
        id: "horse-kbl",
        horseCode: "KBL",
        horseName: "KBL",
        isBroodmare: true,
        foalBirthDate: "1/28",
        foalSex: "メス",
        unloadStatus: "not_unloaded",
      },
    ],
  },
  {
    id: "vehicle-1",
    parkingNo: 1,
    vehicleCode: "",
    unloadBatch: 1,
    memo: "",
    arrivedAt: arrKzn.at,
    arrivedTs: arrKzn.ts,
    horses: [
      {
        id: "horse-kzn-1",
        horseCode: "KZN",
        horseName: "KZN",
        isBroodmare: true,
        unloadStatus: "unloaded",
      },
    ],
  },
];

// 画面下部に表示する馬コード一覧（Excel G13:J21 を再現）
export const initialHorseCodes: string[] = [
  "AMS", "GDG", "DKG", "RSP",
  "EQX", "CON", "DDC", "REY",
  "ISB", "STN", "DFO", "LDK",
  "EPN", "SCW", "NDL",
  "EFO", "SAO", "BOP",
  "ORF", "SIS", "POE",
  "KZN", "SHY", "HRC",
  "KBL", "SMR", "MAU",
  "CRS", "SVR", "LVL",
];

// 上部の駐車枠番号（Excel の 4〜15）
export const PARKING_SLOT_NUMBERS: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
