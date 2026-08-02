// シーズン順番表(クラウド)の読み込み。
// tools/upload-season.mjs が boards/{合言葉}~rosterIndex と boards/{合言葉}~roster~{M-DD} に保存したものを読む。
import { cloudConfig } from "./cloudConfig";
import { GroupKey, RosterEntry } from "./board";

export type DayRosters = Record<GroupKey, RosterEntry[]>;

async function ensureDb() {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getFirestore } = await import("firebase/firestore");
  const { getAuth, signInAnonymously } = await import("firebase/auth");
  const app = getApps().length ? getApps()[0] : initializeApp(cloudConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return getFirestore(app);
}

// 日付一覧(例 ["2-10", ..., "7-07"])。未アップロードなら null
export async function fetchSeasonDays(key: string): Promise<string[] | null> {
  const db = await ensureDb();
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "boards", `${key}~rosterIndex`));
  if (!snap.exists()) return null;
  return (snap.data().days as string[]) ?? null;
}

// 指定日の組別ロスター。無ければ null
export async function fetchSeasonDay(
  key: string,
  day: string
): Promise<DayRosters | null> {
  const db = await ensureDb();
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "boards", `${key}~roster~${day}`));
  if (!snap.exists()) return null;
  const g = snap.data().groups ?? {};
  return {
    朝: (g["朝"] as RosterEntry[]) ?? [],
    昼: (g["昼"] as RosterEntry[]) ?? [],
    夕: (g["夕"] as RosterEntry[]) ?? [],
  };
}

// 今日の日付をシート名形式(M-DD)にする
export function todaySheetName(now = new Date()): string {
  return `${now.getMonth() + 1}-${String(now.getDate()).padStart(2, "0")}`;
}
