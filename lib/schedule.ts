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

// 種付間隔（同じ種牡馬の種付終了(帰宅)から次の種付まで）＝4時間で固定
export const GAP_MIN = 240;
// ロードカナロアの種付中は第二種付所を使わない（絶対条件・固定）
export function isSoloCode(code: string): boolean {
  return normCode(code) === "LDK";
}

// 各組の一番早い開始時刻に種付する馬は、すでに待機しているので5分前呼びでよい
export const FIRST_SLOT_TIMES = ["7:30", "12:45", "16:30"];
export const FIRST_SLOT_PREP = 5;

// 種付所の限定（特定の種付所でしか種付できない種牡馬用）
export type LaneLimit = "first" | "second";
export const LANE_LIMIT_LABEL: Record<LaneLimit, string> = {
  first: "第一のみ",
  second: "第二のみ",
};

// この日のオプション一式
export type Options = {
  priorities: Priorities;
  noConsecGrooms: string[]; // 連続コマで入れない担当者
  groomOverrides: Record<string, string>; // 種牡馬コードごとの当日担当上書き
  laneLimits: Record<string, LaneLimit>; // 種牡馬コード→使える種付所の限定
  durations: Record<string, number>; // 種牡馬コード→平均所要（分）
  defaultDur: number; // 既定の所要（分）
  prepMin: number; // 最初の数頭を何分前に呼ぶか（待機に並ぶ前の助走）
  waitCount: number; // 待機に何頭そろえておくか（第一・第二の2頭＋この頭数が場内にいる）
};
export function defaultOptions(): Options {
  return {
    priorities: { LDK: "first" },
    noConsecGrooms: [],
    groomOverrides: {},
    laneLimits: {},
    durations: {},
    defaultDur: 15,
    prepMin: 30,
    waitCount: 4,
  };
}

// 呼び出し時刻＝自分より waitCount 頭前の馬が種付を始める時刻。
// こうすると常に「第一に1頭・第二に1頭・待機に waitCount 頭」が保たれる。
// 先頭の数頭は前に馬がいないので、開始時刻の prepMin 前に呼ぶ。
export function callMinutes(
  rounds: Round[],
  startMins: number[],
  o: Options
): { m: Mating; roundIndex: number; mateMin: number; callMin: number }[] {
  const seq: { m: Mating; roundIndex: number; mateMin: number }[] = [];
  rounds.forEach((r, i) => {
    for (const m of [r.a, r.b])
      if (m) seq.push({ m, roundIndex: i, mateMin: startMins[i] });
  });
  const n = Math.max(0, Math.floor(o.waitCount));
  return seq.map((s, idx) => {
    if (idx >= n) return { ...s, callMin: seq[idx - n].mateMin };
    // 先頭グループ：その組の最初の枠なら5分前、それ以外は prepMin 前
    const base = startMins[0] ?? s.mateMin;
    return { ...s, callMin: base - prepFor(fmtTime(s.mateMin), o) };
  });
}

// この馬が使える種付所。上り・鎮静は第一限定（マスト）。それ以外は設定に従う。
export function laneOf(m: Mating, o: Options): LaneLimit | null {
  if (firstOnly(m)) return "first";
  return o.laneLimits?.[normCode(m.sireCode)] ?? null;
}
// 呼び出しリード（種付時刻ちょうどが各組の最初の枠なら5分前）
export function prepFor(mateTime: string, o: Options): number {
  return FIRST_SLOT_TIMES.includes(mateTime) ? FIRST_SLOT_PREP : o.prepMin;
}

// 1コマ（第一・第二種付所で最大2頭。a=第一 / b=第二）。startMin=このコマの開始絶対分（固定/間隔待ちのギャップ）
export type Round = { a?: Mating; b?: Mating; startMin?: number };

export type Issue =
  | "same"
  | "groom"
  | "stall"
  | "first2"
  | "lane"
  | "laneLimit"
  | "solo"
  | "consec";
export const ISSUE_LABEL: Record<Issue, string> = {
  same: "同じ種牡馬",
  groom: "担当者が同じ",
  stall: "馬房が隣・正面・斜め",
  first2: "第一限定の馬が2頭",
  lane: "上り/鎮静は第一に",
  laneLimit: "使えない種付所に入っている",
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

const isSolo = (m: Mating) => isSoloCode(m.sireCode);
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
    if (laneOf(a, o) === "first" && laneOf(b, o) === "first") out.push("first2");
    if (isSolo(a) || isSolo(b)) out.push("solo");
  }
  // 使える種付所の限定（上り・鎮静は第一限定）を守っているか
  if (a && laneOf(a, o) === "second") out.push(nf(a) ? "lane" : "laneLimit");
  if (b && laneOf(b, o) === "first") out.push(nf(b) ? "lane" : "laneLimit");
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
  // 順番（最初/早め/遅め/最後）を指定した馬は、その指定を優先する。
  // 順番表の予約時間による時刻固定は無視する（そうしないと指定しても動かせないため）。
  const fixedOf = (m: Mating) =>
    o.priorities[normCode(m.sireCode)] != null ? undefined : fixed[m.id];
  const releaseOf = (m: Mating) =>
    fixedOf(m) ?? earliest[normCode(m.sireCode)] ?? baseStart;

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
    const pinned = fixedOf(m) != null;
    const solo = isSolo(m);
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
        if (other && isSolo(other)) continue;
        // 順番の指定が離れている馬同士は同じコマに入れない
        // （遅め/最後の馬が早い馬のコマに相乗りして前に出てしまうのを防ぐ）
        if (other && Math.abs(rk(m) - rk(other)) > 1) continue;
        if (other && concurrentIssue(m.sireCode, other.sireCode, o) !== null) continue;
        if (hasConsec(groom, rounds[i - 1], rounds[i + 1])) continue;
        // 使える種付所（上り/鎮静＝第一限定、設定による限定）を守って入れる。
        // 相方に限定が無ければ、必要に応じて反対側へ寄せて空けてもらう。
        const myLane = laneOf(m, o);
        let target: "a" | "b" | null = null;
        if (myLane === "first") {
          if (!r.a) target = "a";
          else if (!r.b && laneOf(r.a, o) !== "first") {
            r.b = r.a;
            r.a = undefined;
            target = "a";
          }
        } else if (myLane === "second") {
          if (!r.b) target = "b";
          else if (!r.a && laneOf(r.b, o) !== "second") {
            r.a = r.b;
            r.b = undefined;
            target = "b";
          }
        } else if (!r.a) target = "a";
        else if (!r.b) target = "b";
        if (!target) continue;
        r[target] = m;
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
    // 新規コマは必ずstartMinを明示して置いた位置を確定させる。
    // （省略するとresort()がリリース時刻だけで並べ替え、遅め/最後に指定した馬が
    //   先頭へ戻ってしまうため）
    const startMin = pinned ? rel : Math.max(rel, afterEnd);
    // 第二限定の馬は第二種付所に置く（第一は空きのまま）
    rounds.push(
      laneOf(m, o) === "second" ? { b: m, startMin } : { a: m, startMin }
    );
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
    const xf = fixedOf(x) != null ? 1 : 0;
    const yf = fixedOf(y) != null ? 1 : 0;
    if (xf !== yf) return yf - xf;
    if (xf && yf) return fixedOf(x)! - fixedOf(y)!; // 固定同士は時刻順
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
