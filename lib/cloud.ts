// リアルタイム同期（Firebase Firestore）。cloudConfig 未設定なら無効。
import { cloudConfig } from "./cloudConfig";
import { Vehicle } from "./types";

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
