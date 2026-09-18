// 表示ページの見た目確認用：所在ボード(boards/{合言葉})に各所在へ散らばった馬を入れる
//   node tools/seed-board-demo.mjs <合言葉>
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { cloudConfig } from "./cloudConfig.mjs";

const key = process.argv[2];
if (!key) { console.error("usage: node tools/seed-board-demo.mjs <合言葉>"); process.exit(1); }

const season = JSON.parse(readFileSync("tools/season2026.json", "utf-8"));
const day = season["4-13"]["8:00"];
const roster = day.map((e, i) => ({
  id: `demo-r-${i}`, mareName: e.mareName, sireCode: e.sireCode, farm: e.farm || "",
  kind: e.kind || "", apptTime: e.apptTime || "", arrived: false, note: e.note || "",
}));
const byCode = Object.fromEntries(roster.map((r) => [r.sireCode.normalize("NFKC"), r]));
const now = Date.now();
const min = (n) => now - n * 60000;
const mk = (code, zone, extra = {}) => {
  const r = byCode[code] || {};
  return {
    id: `demo-m-${code}`, mareName: r.mareName || code, farm: r.farm || "", sireCode: r.sireCode || code,
    apptTime: r.apptTime || "", kind: r.kind || "", zone, tags: [], note: r.note || "", treats: [], ...extra,
  };
};
const mares = [
  mk("KBL", "第一種付所", { enteredTs: min(42), matedTs: min(9), matedAt: "第一種付所" }),
  mk("EQX", "第二種付所", { enteredTs: min(35), matedTs: min(3), matedAt: "第二種付所" }),
  mk("SHY", "待機", { enteredTs: min(26) }),
  mk("DFO", "待機", { enteredTs: min(14) }),
  mk("MAU", "待機", { enteredTs: min(6), treats: ["ピン止め"] }),
  mk("ORF", "洗い場", { enteredTs: min(71) }),
  mk("BOP", "洗い場", { enteredTs: min(12) }),
  mk("CON", "鎮静待ち", { enteredTs: min(20), note: "鎮静" }),
  mk("REY", "待機馬房", { enteredTs: min(30), tags: ["種付出来ず待機"] }),
  mk("LDK", "帰宅", { enteredTs: min(95), matedTs: min(70), matedAt: "第一種付所", departedTs: min(40) }),
  mk("STN", "帰宅", { enteredTs: min(80), matedTs: min(55), matedAt: "第二種付所", departedTs: min(30) }),
];

const app = initializeApp(cloudConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
await setDoc(doc(db, "boards", key), { mares, roster, group: "朝", updatedAt: now });
console.log(`seeded: mares=${mares.length} roster=${roster.length} -> boards/${key}`);
process.exit(0);
