// 種付順番の自動組み立て・検証（この日のルール／オプション対応）
import { normCode, noteKind } from "./board";
import { adjacentStalls, groomOf } from "./barns";

export type Mating = {
  id: string;
  mareName: string;
  sireCode: string;
  note?: string;
  apptTime?: string;
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
  groomOverrides: Record<string, string>; // 種牡馬コードごとの当日担当上書き
  durations: Record<string, number>; // 種牡馬コード→平均所要（分）
  defaultDur: number; // 既定の所要（分）
  gapMin: number; // 同じ種牡馬の種付間隔（分）＝既定4時間
  prepMin: number; // 呼び出しから種付までの準備（待機＋洗い場）分
};
export function defaultOptions(): Options {
  return {
    priorities: { LDK: "first" },
    solo: ["LDK"],
    noConsecGrooms: [],
    groomOverrides: {},
    durations: {},
    defaultDur: 15,
    gapMin: 240,
    prepMin: 30,
  };
}

// 1コマ（第一・第二種付所で最大2頭。a=第一 / b=第二）。startMin=このコマの開始絶対分（固定/間隔待ちのギャップ）
export type Round = { a?: Mating; b?: Mating; startMin?: number };

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
export function optionGroomOf(code: string, o: Options): string {
  const c = normCode(code);
  return o.groomOverrides?.[c] ?? groomOf(c);
}
function concurrentIssue(
  codeA: string,
  codeB: string,
  o: Options
): "same" | "groom" | "stall" | null {
  const a = normCode(codeA);
  const b = normCode(codeB);
  if (a === b) return "same";
  const ga = optionGroomOf(a, o);
  const gb = optionGroomOf(b, o);
  if (ga && gb && ga === gb) return "groom";
  if (adjacentStalls(a, b)) return "stall";
  return null;
}

// 1コマの問題点（prevGrooms=直前コマの担当者一覧）
export function roundIssues(
  r: Round,
  prevGrooms: string[],
  o: Options
): Issue[] {
  const out: Issue[] = [];
  const { a, b } = r;
  if (a && b) {
    const c = concurrentIssue(a.sireCode, b.sireCode, o);
    if (c) out.push(c);
    if (nf(a) && nf(b)) out.push("first2");
    else if (nf(b)) out.push("lane"); // 第一必須が第二に入っている
    if (isSolo(a, o) || isSolo(b, o)) out.push("solo");
  }
  const grooms = [a, b]
    .filter(Boolean)
    .map((m) => optionGroomOf((m as Mating).sireCode, o));
  for (const g of grooms)
    if (g && o.noConsecGrooms.includes(g) && prevGrooms.includes(g)) {
      out.push("consec");
      break;
    }
  return out;
}

// 時刻ベースで自動編成。1頭ずつ「その場で」判断して置くため、繰り返し補正ループを持たず必ず終了する。
// 被り・4h違反・連続禁止担当者は配置の瞬間に避け、どうしても隣接する時だけ空きコマを1つ挟んで間隔を作る。
// earliest=種牡馬コード→この組で種付できる最早の絶対分、fixed=牝馬id→固定（呼出）開始分、baseStart=組開始の絶対分
export function autoSchedule(
  matings: Mating[],
  o: Options,
  earliest: Record<string, number> = {},
  fixed: Record<string, number> = {},
  baseStart = 480
): Round[] {
  const rk = (m: Mating) => rankOf(m.sireCode, o.priorities);
  const releaseOf = (m: Mating) =>
    fixed[m.id] ?? earliest[normCode(m.sireCode)] ?? baseStart;

  const rounds: Round[] = [];

  // ラウンドの並び替え用キー（固定時刻 or 収容馬の最遅リリース時刻）
  function nominalKey(r: Round): number {
    if (r.startMin != null) return r.startMin;
    const rs = [r.a, r.b].filter(Boolean).map((m) => releaseOf(m as Mating));
    return rs.length ? Math.max(...rs) : -Infinity;
  }
  function resort() {
    rounds.sort((x, y) => nominalKey(x) - nominalKey(y));
  }
  // 各ラウンドの実開始（収容馬のリリース時刻も下限にする）
  function actualStarts(): number[] {
    let t = baseStart;
    const out: number[] = [];
    for (const r of rounds) {
      const occRel = [r.a, r.b].filter(Boolean).map((m) => releaseOf(m as Mating));
      const floor = Math.max(r.startMin ?? -Infinity, ...occRel, -Infinity);
      const s = floor > -Infinity ? Math.max(t, floor) : t;
      out.push(s);
      t = s + roundMinutes(r, o);
    }
    return out;
  }
  const groomsOf = (r?: Round) =>
    r
      ? [r.a, r.b]
          .filter(Boolean)
          .map((m) => optionGroomOf((m as Mating).sireCode, o))
      : [];
  // 連続禁止の担当者が、隣接ラウンド（前後どちらか）に既にいるか
  function hasConsec(groom: string, prev?: Round, next?: Round): boolean {
    if (!groom || !o.noConsecGrooms.includes(groom)) return false;
    return groomsOf(prev).includes(groom) || groomsOf(next).includes(groom);
  }

  function place(m: Mating) {
    resort();
    const rel = releaseOf(m);
    const pinned = fixed[m.id] != null;
    const solo = isSolo(m, o);
    const groom = optionGroomOf(m.sireCode, o);

    if (!solo) {
      const starts = actualStarts();
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        // 固定（呼出時刻決定）の馬は、ちょうど同じ時刻の枠にしか同居させない。
        // 通常の馬は、その時刻以降の空いている枠なら入れる。
        if (pinned ? starts[i] !== rel : starts[i] < rel) continue;
        if (r.a && r.b) continue;
        const other = r.a || r.b;
        if (other && isSolo(other, o)) continue;
        if (other && concurrentIssue(m.sireCode, other.sireCode, o) !== null) continue;
        if (other && nf(m) && nf(other)) continue;
        if (hasConsec(groom, rounds[i - 1], rounds[i + 1])) continue;
        if (!r.a) r.a = m;
        else if (nf(m) && !nf(r.a)) {
          r.b = r.a;
          r.a = m;
        } else r.b = m;
        return;
      }
    }
    // 既存コマに入らなければ新規コマを末尾に追加。
    // 直前コマと連続禁止の担当者が被るなら、間に空きコマを1つ挟んで間隔を作る
    // （固定の馬でも、被りを避けるためだけに時刻を後ろへずらす）。
    const starts = actualStarts();
    const tailIdx = rounds.length - 1;
    const tailEnd = rounds.length
      ? starts[tailIdx] + roundMinutes(rounds[tailIdx], o)
      : baseStart;
    const spacerInserted = hasConsec(groom, rounds[tailIdx]);
    if (spacerInserted) {
      rounds.push({ startMin: tailEnd });
    }
    const afterEnd = rounds.length
      ? (() => {
          const s2 = actualStarts();
          const li = rounds.length - 1;
          return s2[li] + roundMinutes(rounds[li], o);
        })()
      : baseStart;
    // スペーサーを挟んだ直後のコマは、次回以降のresort()で元の位置へ
    // 戻ってしまわないよう必ずstartMinを明示して固定する
    const startMin = spacerInserted
      ? Math.max(rel, afterEnd)
      : rel > afterEnd || pinned
        ? rel
        : undefined;
    rounds.push({ a: m, startMin });
  }

  // 処理順：優先度→固定（呼出時刻決定）を優先→リリース時刻→カナロア優先→難易度
  const deg: Record<string, number> = {};
  for (const m of matings)
    deg[m.id] = matings.filter(
      (x) => x.id !== m.id && concurrentIssue(m.sireCode, x.sireCode, o) !== null
    ).length;
  const ordered = [...matings].sort((x, y) => {
    const rr = rk(x) - rk(y);
    if (rr) return rr;
    const xf = fixed[x.id] != null ? 1 : 0;
    const yf = fixed[y.id] != null ? 1 : 0;
    if (xf !== yf) return yf - xf;
    if (xf && yf) return fixed[x.id] - fixed[y.id]; // 固定同士は時刻順
    const ee = releaseOf(x) - releaseOf(y); // 早く呼べない馬は後ろへ
    if (ee) return ee;
    const fx = normCode(x.sireCode) === "LDK" ? 1 : 0;
    const fy = normCode(y.sireCode) === "LDK" ? 1 : 0;
    if (fx !== fy) return fy - fx;
    return deg[y.id] - deg[x.id];
  });
  for (const m of ordered) place(m);
  resort();
  return rounds;
}

// 1コマの所要（分）＝2頭の長い方。空きコマ（連続禁止回避の間隔用）は既定の所要ぶん確保する
export function roundMinutes(r: Round, o: Options): number {
  const d = (m?: Mating) =>
    m ? o.durations[normCode(m.sireCode)] || o.defaultDur : 0;
  if (!r.a && !r.b) return o.defaultDur;
  return Math.max(d(r.a), d(r.b), 1);
}
export function fmtTime(total: number): string {
  const hh = Math.floor(total / 60) % 24;
  const mm = ((total % 60) + 60) % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}
export function toMin(hhmm: string): number {
  const [h, m] = (hhmm || "8:00").split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}
// 各コマの開始（絶対分）。startMin（固定/間隔待ち）があればその時刻以降にずらす
function startMinutesBase(rounds: Round[], baseMin: number, o: Options): number[] {
  let t = baseMin;
  const out: number[] = [];
  for (const r of rounds) {
    const s = r.startMin != null ? Math.max(r.startMin, t) : t;
    out.push(s);
    t = s + roundMinutes(r, o);
  }
  return out;
}
export function startMinutes(rounds: Round[], start: string, o: Options): number[] {
  return startMinutesBase(rounds, toMin(start), o);
}
// 各コマの開始時刻（表示用）
export function startTimes(rounds: Round[], start: string, o: Options): string[] {
  return startMinutes(rounds, start, o).map(fmtTime);
}
// この組の種牡馬別 最終種付（絶対分）
export function matingTimes(
  rounds: Round[],
  start: string,
  o: Options
): Record<string, number> {
  const mins = startMinutes(rounds, start, o);
  const map: Record<string, number> = {};
  rounds.forEach((r, i) => {
    for (const m of [r.a, r.b]) {
      if (!m) continue;
      const c = normCode(m.sireCode);
      if (map[c] == null || mins[i] > map[c]) map[c] = mins[i];
    }
  });
  return map;
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
        if (concurrentIssue(cand.sireCode, other.sireCode, o) !== null) continue;
        if (nf(cand) && nf(other)) continue;
        if (isSolo(cand, o) || isSolo(other, o)) continue;
      } else if (isSolo(cand, o)) continue;
      return cand;
    }
  }
  return null;
}

// 任意の2枠を入れ替え（タップ→タップ操作用）
export function swapSlots(
  rounds: Round[],
  i: number,
  la: "a" | "b",
  j: number,
  lb: "a" | "b"
): Round[] {
  const next = rounds.map((r) => ({ ...r }));
  const t = next[i][la];
  next[i][la] = next[j][lb];
  next[j][lb] = t;
  return next;
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
