// 順番表JSON(parse_season.pyの出力)をFirestoreへアップロードする。
//
// 使い方:
//   node tools/upload-season.mjs <合言葉> <season.jsonのパス>
//
// 保存先(既存ルールで書ける boards コレクション直下を使う):
//   boards/{合言葉}~rosterIndex          … { days: ["2-10", ...] }
//   boards/{合言葉}~roster~{M-DD}        … { groups: { "朝": [...], "昼": [...], "夕": [...] } }
// entryはアプリのRosterEntry形式に変換(id付与・arrived:false)。
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { cloudConfig } from "./cloudConfig.mjs";

const [key, jsonPath] = process.argv.slice(2);
if (!key || !jsonPath) {
  console.error("usage: node tools/upload-season.mjs <合言葉> <season.json>");
  process.exit(1);
}

const season = JSON.parse(readFileSync(jsonPath, "utf-8"));
const GROUP_OF = { "8:00": "朝", "13:00": "昼", "17:00": "夕" };

const app = initializeApp(cloudConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const days = Object.keys(season);
let uploaded = 0;
for (const day of days) {
  const groups = {};
  for (const [time, label] of Object.entries(GROUP_OF)) {
    const list = season[day][time] ?? [];
    groups[label] = list.map((e, i) => ({
      id: `d${day}-${label}-${i}-${e.sireCode}`,
      mareName: e.mareName,
      sireCode: e.sireCode,
      farm: e.farm ?? "",
      kind: e.kind ?? "",
      apptTime: e.apptTime ?? "",
      arrived: false,
      note: e.note ?? "",
    }));
  }
  await setDoc(doc(db, "boards", `${key}~roster~${day}`), {
    groups,
    updatedAt: Date.now(),
  });
  uploaded++;
  if (uploaded % 20 === 0) console.log(`  ${uploaded}/${days.length}`);
}
await setDoc(doc(db, "boards", `${key}~rosterIndex`), {
  days,
  updatedAt: Date.now(),
});
console.log(`done: ${uploaded} days + index -> boards/${key}~roster~*`);
process.exit(0);
