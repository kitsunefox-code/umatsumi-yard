// 種付順番の自動組み立て・検証（この日のルール／オプション対応）
import { normCode, noteKind } from "./board";
import { concurrentConflict, groomOf } from "./barns";

export type Mating = {
  id: string;
  mareName: string;
  sireCode: string;
  note?: string;
};
// 第一種付所が必須か（上り初回・鎮静はマストで第一）
export function firstOnly(m: Mating): "" | "上り" | "鎮静" {
  const k = noteKind(m.note);
  if (k === "sedate") return "鎮静";
  if (k === "agari") return "上り";
  return "";
}

export type Priority = "first" | "early" | "late" | "last";
export type Priorities = Record<string, Priority>;
export const PRIORITY_ORDER: Priority[] = ["first", "early", "late", "last"];
export const PRIORITY_LABEL: Record<Priority, string> = {
  first: "最初",
  early: "早め",
  late: "遅め",
  last: "最後",
};

// この日のオプション一式
export type Options = {
  priorities: Priorities;
  solo: string[]; // 単独（同時に第二を使わない）種牡馬コード
  noConsecGrooms: string[]; // 連続コマで入れない担当者
  durations: Record<string, number>; // 種牡馬コード→平均所要（分）
  defaultDur: number; // 既定の所要（分）
};
export function defaultOptions(): Options {
  return {
    priorities: { LDK: "first" },
    solo: ["LDK"],
    noConsecGrooms: [],
    durations: {},
    defaultDur: 15,
  };
}

// 1コマ（第一・第二種付所で最大2頭。a=第一 / b=第二）
export type Round = { a?: Mating; b?: Mating };

export type Issue = "same" | "groom" | "stall" | "first2" | "lane" | "solo" | "consec";
export const ISSUE_LABEL: Record<Issue, string> = {
  same: "同じ種牡馬",
  groom: "担当者が同じ",
  stall: "馬房が隣・正面・斜め",
  first2: "上り/鎮静が2頭（第一は1頭）",
  lane: "上り/鎮静は第一に",
  solo: "単独のはずが2頭",
  consec: "担当者が連続",
};

function rankOf(code: string, pri: Priorities): number {
  const p = pri[normCode(code)];
  if (p === "first") return 0;
  if (p === "early") return 1;
  if (p === "late") return 3;
  if (p === "last") return 4;
  return 2;
}

const isSolo = (m: Mating, o: Options) => o.solo.includes(normCode(m.sireCode));
const nf = (m: Mating) => !!firstOnly(m);

// 1コマの問題点（prevGrooms=直前コマの担当者一覧）
export function roundIssues(
  r: Round,
  prevGrooms: string[],
  o: Options
): Issue[] {
  const out: Issue[] = [];
  const { a, b } = r;
  if (a && b) {
    const c = concurrentConflict(a.sireCode, b.sireCode);
    if (c) out.push(c);
    if (nf(a) && nf(b)) out.push("first2");
    else if (nf(b)) out.push("lane"); // 第一必須が第二に入っている
    if (isSolo(a, o) || isSolo(b, o)) out.push("solo");
  }
  const grooms = [a, b].filter(Boolean).map((m) => groomOf((m as Mating).sireCode));
  for (const g of grooms)
    if (g && o.noConsecGrooms.includes(g) && prevGrooms.includes(g)) {
      out.push("consec");
      break;
    }
  return out;
}

function pickPartner(
  pool: Mating[],
  used: Set<string>,
  i: number,
  a: Mating,
  o: Options,
  prevGrooms: string[],
  avoidConsec: boolean
): Mating | undefined {
  const rankA = rankOf(a.sireCode, o.priorities);
  for (let j = i + 1; j < pool.length; j++) {
    const c = pool[j];
    if (used.has(c.id)) continue;
    if (rankOf(c.sireCode, o.priorities) > rankA + 1) break; // 優先度が離れすぎ
    if (concurrentConflict(a.sireCode, c.sireCode) !== null) continue;
    if (nf(a) && nf(c)) continue; // 第一は1頭まで
    if (isSolo(a, o) || isSolo(c, o)) continue;
    if (avoidConsec) {
      const gs = [groomOf(a.sireCode), groomOf(c.sireCode)];
      if (gs.some((g) => g && o.noConsecGrooms.includes(g) && prevGrooms.includes(g)))
        continue;
    }
    return c;
  }
  return undefined;
}

// 自動で被らない順番を組む
export function autoSchedule(matings: Mating[], o: Options): Round[] {
  const fc = "LDK";
  const rk = (m: Mating) => rankOf(m.sireCode, o.priorities);
  const deg: Record<string, number> = {};
  for (const m of matings)
    deg[m.id] = matings.filter(
      (x) => x.id !== m.id && concurrentConflict(m.sireCode, x.sireCode) !== null
    ).length;
  const pool = [...matings].sort((x, y) => {
    const rr = rk(x) - rk(y);
    if (rr) return rr;
    const fx = normCode(x.sireCode) === fc ? 1 : 0;
    const fy = normCode(y.sireCode) === fc ? 1 : 0;
    if (fx !== fy) return fy - fx;
    return deg[y.id] - deg[x.id];
  });
  const rounds: Round[] = [];
  const used = new Set<string>();
  let prevGrooms: string[] = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a.id)) continue;
    used.add(a.id);
    if (isSolo(a, o)) {
      rounds.push({ a });
      prevGrooms = [groomOf(a.sireCode)];
      continue;
    }
    let b = pickPartner(pool, used, i, a, o, prevGrooms, true);
    if (!b) b = pickPartner(pool, used, i, a, o, prevGrooms, false);
    if (b) used.add(b.id);
    let ra = a;
    let rb = b;
    if (b && nf(b) && !nf(a)) {
      ra = b;
      rb = a;
    } // 上り/鎮静を第一（a）へ
    rounds.push({ a: ra, b: rb });
    prevGrooms = [ra, rb].filter(Boolean).map((m) => groomOf((m as Mating).sireCode));
  }
  return rounds;
}

// 1コマの所要（分）＝2頭の長い方
export function roundMinutes(r: Round, o: Options): number {
  const d = (m?: Mating) =>
    m ? o.durations[normCode(m.sireCode)] || o.defaultDur : 0;
  return Math.max(d(r.a), d(r.b), 1);
}
function fmt(total: number): string {
  const hh = Math.floor(total / 60) % 24;
  const mm = ((total % 60) + 60) % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}
// 各コマの開始時刻（所要を積み上げ）
export function startTimes(rounds: Round[], start: string, o: Options): string[] {
  const [h, m] = (start || "8:00").split(":").map((n) => parseInt(n, 10) || 0);
  let t = h * 60 + m;
  const out: string[] = [];
  for (const r of rounds) {
    out.push(fmt(t));
    t += roundMinutes(r, o);
  }
  return out;
}

// 「この馬が早く終わったら次はこれ」＝残りコマから繰り上げ候補
export function earlyFinishPick(
  rounds: Round[],
  i: number,
  lane: "a" | "b",
  o: Options
): Mating | null {
  const other = lane === "a" ? rounds[i].b : rounds[i].a;
  for (let j = i + 1; j < rounds.length; j++) {
    for (const ln of ["a", "b"] as const) {
      const cand = rounds[j][ln];
      if (!cand) continue;
      if (other) {
        if (concurrentConflict(cand.sireCode, other.sireCode) !== null) continue;
        if (nf(cand) && nf(other)) continue;
        if (isSolo(cand, o) || isSolo(other, o)) continue;
      } else if (isSolo(cand, o)) continue;
      return cand;
    }
  }
  return null;
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
export function trimEmpty(rounds: Round[]): Round[] {
  const out = rounds.filter((r) => r.a || r.b);
  return out.length ? out : [{}];
}
