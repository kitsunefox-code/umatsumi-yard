// 種付順番の自動組み立て・検証
import { normCode } from "./board";
import { concurrentConflict } from "./barns";

export type Mating = {
  id: string;
  mareName: string;
  sireCode: string;
  note?: string;
};
// 1コマ（同時に第一・第二種付所で最大2頭）
export type Round = { a?: Mating; b?: Mating };
export type ConflictKind = "same" | "groom" | "stall";

export function roundConflict(r: Round): ConflictKind | null {
  if (r.a && r.b) return concurrentConflict(r.a.sireCode, r.b.sireCode);
  return null;
}

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  same: "同じ種牡馬",
  groom: "担当者が同じ",
  stall: "馬房が隣・正面・斜め",
};

// 自動で被らない順番を組む。firstCode（既定=ロードカナロア）を必ず1コマ目に。
export function autoSchedule(matings: Mating[], firstCode = "LDK"): Round[] {
  const fc = normCode(firstCode);
  // 各種付の「同時に組めない相手の数」＝難易度
  const deg: Record<string, number> = {};
  for (const m of matings) {
    deg[m.id] = matings.filter(
      (x) => x.id !== m.id && concurrentConflict(m.sireCode, x.sireCode) !== null
    ).length;
  }
  const pool = [...matings].sort((x, y) => {
    const fx = normCode(x.sireCode) === fc ? 1 : 0;
    const fy = normCode(y.sireCode) === fc ? 1 : 0;
    if (fx !== fy) return fy - fx; // firstCode を先頭へ
    return deg[y.id] - deg[x.id]; // 難しい（被りやすい）ものを先に
  });
  const rounds: Round[] = [];
  const used = new Set<string>();
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a.id)) continue;
    used.add(a.id);
    let b: Mating | undefined;
    for (let j = i + 1; j < pool.length; j++) {
      const cand = pool[j];
      if (used.has(cand.id)) continue;
      if (concurrentConflict(a.sireCode, cand.sireCode) === null) {
        b = cand;
        used.add(cand.id);
        break;
      }
    }
    rounds.push({ a, b });
  }
  return rounds;
}

// 開始時刻＋コマ時間からコマの時刻
export function slotTime(start: string, stepMin: number, idx: number): string {
  const [h, m] = (start || "8:00").split(":").map((n) => parseInt(n, 10) || 0);
  const total = h * 60 + m + idx * stepMin;
  const hh = Math.floor(total / 60) % 24;
  const mm = ((total % 60) + 60) % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

// 手動操作
export function swapLane(rounds: Round[], i: number): Round[] {
  const next = rounds.map((r) => ({ ...r }));
  const t = next[i].a;
  next[i].a = next[i].b;
  next[i].b = t;
  return next;
}
export function moveCard(
  rounds: Round[],
  i: number,
  lane: "a" | "b",
  dir: -1 | 1
): Round[] {
  const j = i + dir;
  if (j < 0 || j >= rounds.length) return rounds;
  const next = rounds.map((r) => ({ ...r }));
  const t = next[i][lane];
  next[i][lane] = next[j][lane];
  next[j][lane] = t;
  return next;
}
// 末尾の空コマを削除
export function trimEmpty(rounds: Round[]): Round[] {
  const out = rounds.filter((r) => r.a || r.b);
  return out.length ? out : [{}];
}
