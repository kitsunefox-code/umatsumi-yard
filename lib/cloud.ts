// リアルタイム同期（Firebase Firestore）。cloudConfig 未設定なら無効。
import { cloudConfig } from "./cloudConfig";
import { Vehicle } from "./types";
import { Mare, RosterEntry, GroupKey } from "./board";

export type BoardData = {
  mares: Mare[];
  roster: RosterEntry[];
  group?: GroupKey;
};

export const cloudEnabled = !!cloudConfig.apiKey;

// firebase を遅延ロードして初期化（匿名認証まで）
async function ensureDb() {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getFirestore } = await import("firebase/firestore");
  const { getAuth, signInAnonymously } = await import("firebase/auth");
  const app = getApps().length ? getApps()[0] : initializeApp(cloudConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return getFirestore(app);
}

// 合言葉(accessKey)の駐車場データを購読。更新のたび cb(vehicles|null) を呼ぶ。
export async function subscribeYard(
  key: string,
  cb: (vehicles: Vehicle[] | null) => void
): Promise<() => void> {
  const db = await ensureDb();
  const { doc, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(doc(db, "yards", key), (snap) => {
    cb(snap.exists() ? ((snap.data().vehicles as Vehicle[]) ?? []) : null);
  });
}

// 合言葉の駐車場データを保存（上書き）。
export async function saveYard(
  key: string,
  vehicles: Vehicle[]
): Promise<void> {
  const db = await ensureDb();
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "yards", key), { vehicles, updatedAt: Date.now() });
}

// ===== 所在ボード（牝馬の現在地＋本日の予定）の同期 =====
export async function subscribeBoard(
  key: string,
  cb: (data: BoardData | null) => void
): Promise<() => void> {
  const db = await ensureDb();
  const { doc, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(doc(db, "boards", key), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const d = snap.data();
    cb({
      mares: (d.mares as Mare[]) ?? [],
      roster: (d.roster as RosterEntry[]) ?? [],
      group: (d.group as GroupKey) ?? undefined,
    });
  });
}

export async function saveBoard(
  key: string,
  mares: Mare[],
  roster: RosterEntry[],
  group?: GroupKey
): Promise<void> {
  const db = await ensureDb();
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "boards", key), {
    mares,
    roster,
    group: group ?? "朝",
    updatedAt: Date.now(),
  });
}

// ===== 種付順番（表示専用ページ向けに、操作ページで組んだ結果を共有） =====
// 表示側で計算し直さず、操作ページが画面に出している行をそのまま送る。
export type SchedRow = {
  id: string;
  no: number; // コマ番号（1始まり）
  lane: "a" | "b"; // 第一 / 第二
  call: string; // 呼ぶ時刻
  mate: string; // 種付時刻
  sireCode: string;
  mareName: string;
  groom: string; // 空なら担当者不明
  groomOff: boolean; // 担当が休み
  tags: { t: string; k: string }[]; // 印（最初/早め/上り/OV/第一のみ…）
  warn: string; // 確認事項（無ければ空）
  bad: boolean; // 行を赤くするか
  empty?: boolean; // 空き枠
};
export type SchedPublish = {
  rows: SchedRow[];
  start: string;
  headCount: number;
  updatedAt: number;
};
export type SchedDoc = {
  day: string;
  groups: Partial<Record<GroupKey, SchedPublish>>;
};

// 操作ページ → クラウド。組ごとに merge 保存し、「今出している日」も記録する
export async function publishSchedule(
  key: string,
  day: string,
  group: GroupKey,
  payload: SchedPublish
): Promise<void> {
  const db = await ensureDb();
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(
    doc(db, "boards", `${key}~sched~${day}`),
    { day, groups: { [group]: payload } },
    { merge: true }
  );
  await setDoc(doc(db, "boards", `${key}~schedCurrent`), {
    day,
    group,
    updatedAt: Date.now(),
  });
}

// 表示ページ：「今出している日」を追いかけ、その日の順番表を購読する
export async function subscribeScheduleCurrent(
  key: string,
  cb: (cur: { day: string; group: GroupKey } | null) => void
): Promise<() => void> {
  const db = await ensureDb();
  const { doc, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(doc(db, "boards", `${key}~schedCurrent`), (snap) => {
    if (!snap.exists()) return cb(null);
    const d = snap.data();
    cb({ day: d.day as string, group: (d.group as GroupKey) ?? "朝" });
  });
}
export async function subscribeSchedule(
  key: string,
  day: string,
  cb: (d: SchedDoc | null) => void
): Promise<() => void> {
  const db = await ensureDb();
  const { doc, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(doc(db, "boards", `${key}~sched~${day}`), (snap) => {
    if (!snap.exists()) return cb(null);
    const d = snap.data();
    cb({ day: (d.day as string) ?? day, groups: (d.groups as SchedDoc["groups"]) ?? {} });
  });
}
