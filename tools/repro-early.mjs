// 「早め」設定が効かない現象の再現（実データ4-13朝で検証）
import { readFileSync } from "node:fs";

// lib/schedule.ts は TS なので、ロジックだけ最小再現する代わりに
// 実アプリと同じ流れを Node で確かめるため、tsx なしで概略再現する。
// ここでは「並び順に優先度がどう効くか」だけを見る。
const season = JSON.parse(readFileSync("tools/season2026.json", "utf-8"));
const day = season["4-13"];
const list = day["8:00"];
console.log("朝の頭数:", list.length);
console.log("予約時間あり:", list.filter((e) => e.apptTime).length);
console.log(
  "予約時間なし:",
  list.filter((e) => !e.apptTime).map((e) => e.sireCode)
);
console.log("--- 全件 ---");
for (const e of list) {
  console.log(e.sireCode, e.apptTime || "(なし)", e.mareName);
}
