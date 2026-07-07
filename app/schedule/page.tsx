"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GroupKey,
  ROSTER_GROUPS,
  groupRoster,
  sireBadge,
  normCode,
  noteKind,
} from "@/lib/board";
import type { Mare } from "@/lib/board";
import { STALLIONS, BARNS, groomOf, barnOf } from "@/lib/barns";
import { cloudEnabled, subscribeBoard } from "@/lib/cloud";
import {
  Mating,
  Round,
  Options,
  Priority,
  PRIORITY_ORDER,
  PRIORITY_LABEL,
  ISSUE_LABEL,
  defaultOptions,
  autoSchedule,
  roundIssues,
  startTimes,
  startMinutes,
  matingTimes,
  fmtTime,
  toMin,
  roundMinutes,
  earlyFinishPick,
  firstOnly,
  optionGroomOf,
  swapSlots,
  trimEmpty,
} from "@/lib/schedule";
import type { Mating as M2 } from "@/lib/schedule";

const START_BY_GROUP: Record<GroupKey, string> = {
  朝: "8:00",
  昼: "13:00",
  夕: "17:00",
};
const DAY_ORDER: GroupKey[] = ["朝", "昼", "夕"];

const toMating = (r: {
  id: string;
  mareName: string;
  sireCode: string;
  apptTime?: string;
  note?: string;
}): M2 => ({
  id: r.id,
  mareName: r.mareName,
  sireCode: r.sireCode,
  apptTime: r.apptTime,
  note: r.note,
});

function safeParse(s: string): Record<string, string> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
function quarterTime(hhmm: string): string {
  if (!hhmm) return "";
  return fmtTime(Math.round(toMin(hhmm) / 15) * 15);
}

// 先行する組（朝→昼→夕）の種付時刻＋間隔、および所在ボードの実際の種付終了から、
// この組で各種牡馬を呼べる最早時刻（絶対分）を求める。realEnd=種牡馬コード→実種付終了(絶対分)
function computeEarliest(
  g: GroupKey,
  o: Options,
  realEnd: Record<string, number> = {}
): Record<string, number> {
  const idx = DAY_ORDER.indexOf(g);
  const out: Record<string, number> = {};
  const bump = (c: string, e: number) => {
    if (out[c] == null || e > out[c]) out[c] = e;
  };
  for (let k = 0; k < idx; k++) {
    const gk = DAY_ORDER[k];
    const rs = autoSchedule(
      groupRoster(gk).map(toMating),
      o,
      {},
      {},
      toMin(START_BY_GROUP[gk])
    );
    const t = matingTimes(rs, START_BY_GROUP[gk], o);
    for (const c in t) bump(c, t[c] + o.gapMin);
  }
  // 所在ボードの実績（実際の種付終了）を優先的に反映
  for (const c in realEnd) bump(c, realEnd[c] + o.gapMin);
  return out;
}

function Badge({ code }: { code: string }) {
  const b = sireBadge(code);
  return (
    <span
      className={`sched-badge${b.twoTone ? " twotone" : ""}`}
      style={{ background: b.background, color: b.color }}
    >
      {normCode(code) || "?"}
    </span>
  );
}

export default function SchedulePage() {
  const [group, setGroup] = useState<GroupKey>("朝");
  const [start, setStart] = useState("8:00");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [showEarly, setShowEarly] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [opts, setOpts] = useState<Options>(defaultOptions());
  const [sel, setSel] = useState<{ i: number; lane: "a" | "b" } | null>(null);
  const [fixedTimes, setFixedTimes] = useState<Record<string, string>>({});
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [boardMares, setBoardMares] = useState<Mare[]>([]);

  const matings: Mating[] = useMemo(
    () =>
      groupRoster(group).map((r) => ({
        id: r.id,
        mareName: r.mareName,
        sireCode: r.sireCode,
        apptTime: r.apptTime,
        note: r.note,
      })),
    [group]
  );

  // オプション復元＋所在ボードの合言葉
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sched:opts");
    if (saved) {
      try {
        setOpts({ ...defaultOptions(), ...JSON.parse(saved) });
      } catch {}
    }
    setAccessKey(localStorage.getItem("mare-transport-access-key"));
  }, []);

  // 所在ボードを購読（実際の種付時刻を4h間隔の基準に使う）
  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let unsub = () => {};
    subscribeBoard(accessKey, (data) => setBoardMares(data?.mares ?? []))
      .then((u) => {
        if (u) unsub = u;
      })
      .catch(() => {});
    return () => unsub();
  }, [accessKey]);

  // 固定時刻（この組）の復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = localStorage.getItem("sched:fixedCall:" + group);
    setFixedTimes(s ? safeParse(s) : {});
  }, [group]);

  // 所在ボードの matedTs から、種牡馬別の実・種付終了（絶対分）
  const realEnd = useMemo(() => {
    const map: Record<string, number> = {};
    for (const mare of boardMares) {
      if (!mare.matedTs) continue;
      const c = normCode(mare.sireCode);
      const d = new Date(mare.matedTs);
      const end =
        d.getHours() * 60 + d.getMinutes() + (opts.durations[c] || opts.defaultDur);
      if (map[c] == null || end > map[c]) map[c] = end;
    }
    return map;
  }, [boardMares, opts.durations, opts.defaultDur]);

  const rosterFixedTimes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of matings) {
      if (m.apptTime) out[m.id] = quarterTime(m.apptTime);
    }
    return out;
  }, [matings]);

  const effectiveFixedTimes = useMemo(() => {
    const out = { ...rosterFixedTimes };
    for (const id in fixedTimes) {
      if (fixedTimes[id]) out[id] = fixedTimes[id];
    }
    return out;
  }, [rosterFixedTimes, fixedTimes]);

  const fixedMin = useMemo(() => {
    const m: Record<string, number> = {};
    for (const id in effectiveFixedTimes)
      if (effectiveFixedTimes[id]) m[id] = toMin(effectiveFixedTimes[id]) + opts.prepMin;
    return m;
  }, [effectiveFixedTimes, opts.prepMin]);

  const baseStart = toMin(START_BY_GROUP[group]);
  function buildRounds(o: Options, fx = fixedMin) {
    return autoSchedule(
      matings,
      o,
      computeEarliest(group, o, realEnd),
      fx,
      baseStart
    );
  }

  // 組の切替：開始時刻を既定にし、必ず「未生成」から始める（生成ボタンを押すまで組まない）
  useEffect(() => {
    setStart(START_BY_GROUP[group]);
    setSel(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("sched:" + group);
    }
    setRounds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  // ルール変更は保存のみ（即座には組み直さない）。反映するには「生成」を押す。
  function applyOpts(next: Options) {
    setOpts(next);
    if (typeof window !== "undefined")
      localStorage.setItem("sched:opts", JSON.stringify(next));
  }
  // 固定時刻の設定（これも保存のみ。反映には「生成」を押す）
  function setFixed(id: string, hhmm: string) {
    const next = { ...fixedTimes };
    if (hhmm) next[id] = hhmm;
    else delete next[id];
    setFixedTimes(next);
    if (typeof window !== "undefined")
      localStorage.setItem("sched:fixedCall:" + group, JSON.stringify(next));
  }
  function fixedCallTime(id: string): string {
    const t = effectiveFixedTimes[id];
    return t ? t.padStart(5, "0") : "";
  }
  function setFixedCallTime(id: string, hhmm: string) {
    setFixed(id, quarterTime(hhmm));
  }
  function setGroom(code: string, groom: string) {
    const c = normCode(code);
    const next = { ...(opts.groomOverrides || {}) };
    if (groom === "__default") delete next[c];
    else next[c] = groom;
    applyOpts({ ...opts, groomOverrides: next });
  }
  function setPriority(code: string, p: Priority | "") {
    const pr = { ...opts.priorities };
    if (p === "first") {
      for (const c in pr) if (pr[c] === "first" && c !== code) delete pr[c];
    }
    if (p) pr[code] = p;
    else delete pr[code];
    applyOpts({ ...opts, priorities: pr });
  }
  function toggleSolo(code: string) {
    const has = opts.solo.includes(code);
    applyOpts({
      ...opts,
      solo: has ? opts.solo.filter((c) => c !== code) : [...opts.solo, code],
    });
  }
  function setDuration(code: string, min: number | null) {
    const d = { ...opts.durations };
    if (min && min > 0) d[code] = min;
    else delete d[code];
    applyOpts({ ...opts, durations: d });
  }
  function toggleGroom(g: string) {
    const has = opts.noConsecGrooms.includes(g);
    applyOpts({
      ...opts,
      noConsecGrooms: has
        ? opts.noConsecGrooms.filter((x) => x !== g)
        : [...opts.noConsecGrooms, g],
    });
  }

  // 「生成」＝この時点のルール・固定時刻を使って一から組み立てる（唯一の編成トリガー）
  function generate() {
    setSel(null);
    setRounds(buildRounds(opts, fixedMin));
    setShowCall(true);
  }

  // この組で各種牡馬を呼べる最早時刻（4h間隔）＋各コマの絶対分
  const earliest = useMemo(
    () => computeEarliest(group, opts, realEnd),
    [group, opts, realEnd]
  );
  const startMins = useMemo(
    () => startMinutes(rounds, start, opts),
    [rounds, start, opts]
  );

  // タップで入れ替え：1枚目タップ→選択、2枚目タップ→入れ替え
  function tapSlot(i: number, lane: "a" | "b", blocked: boolean) {
    if (blocked) return;
    const cur = rounds[i][lane];
    if (!sel) {
      if (cur) setSel({ i, lane });
      return;
    }
    if (sel.i === i && sel.lane === lane) {
      setSel(null);
      return;
    }
    setRounds(swapSlots(rounds, sel.i, sel.lane, i, lane));
    setSel(null);
  }

  const times = useMemo(() => startTimes(rounds, start, opts), [rounds, start, opts]);
  const issuesByRound = useMemo(() => {
    let prev: string[] = [];
    return rounds.map((r) => {
      const iss = roundIssues(r, prev, opts);
      prev = [r.a, r.b]
        .filter(Boolean)
        .map((m) => optionGroomOf((m as Mating).sireCode, opts));
      return iss;
    });
  }, [rounds, opts]);
  // 4時間ルール：この組で早すぎる種付（前の組から間隔不足）
  const gapBad = useMemo(
    () =>
      rounds.map((r, i) => {
        const bad: { code: string; prev: number }[] = [];
        for (const m of [r.a, r.b]) {
          if (!m) continue;
          const c = normCode(m.sireCode);
          if (earliest[c] != null && startMins[i] < earliest[c])
            bad.push({ code: c, prev: earliest[c] - opts.gapMin });
        }
        return bad;
      }),
    [rounds, startMins, earliest, opts.gapMin]
  );
  const badRounds = issuesByRound.filter((x, i) => x.length || gapBad[i].length)
    .length;
  const scheduled = rounds.reduce((n, r) => n + (r.a ? 1 : 0) + (r.b ? 1 : 0), 0);
  const ldkFirst =
    rounds.length > 0 &&
    (normCode(rounds[0].a?.sireCode || "") === "LDK" ||
      normCode(rounds[0].b?.sireCode || "") === "LDK");

  // この組に出てくる種牡馬・担当者
  const groupCodes = useMemo(() => {
    const seen: string[] = [];
    for (const m of matings) {
      const c = normCode(m.sireCode);
      if (c && !seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [matings]);
  const allGrooms = useMemo(() => {
    const seen: string[] = [];
    for (const s of STALLIONS) {
      const g = groomOf(s.code);
      if (g && !seen.includes(g)) seen.push(g);
    }
    return seen.sort();
  }, []);
  const groupGrooms = useMemo(() => {
    const seen: string[] = [];
    for (const c of groupCodes) {
      const g = optionGroomOf(c, opts);
      if (g && !seen.includes(g)) seen.push(g);
    }
    return seen.sort();
  }, [groupCodes, opts]);
  const ruleCount =
    groupCodes.filter((c) => opts.priorities[c]).length +
    opts.solo.length +
    Object.keys(opts.durations).length +
    opts.noConsecGrooms.length +
    Object.keys(opts.groomOverrides || {}).length +
    Object.keys(effectiveFixedTimes).filter((id) => effectiveFixedTimes[id]).length;

  function Card({ m, i, lane }: { m?: Mating; i: number; lane: "a" | "b" }) {
    const isSel = sel?.i === i && sel?.lane === lane;
    const targeting = sel !== null && !isSel;
    // 単独コマの第二レーンは使用不可表示
    if (!m) {
      const solo =
        lane === "b" &&
        rounds[i].a &&
        opts.solo.includes(normCode(rounds[i].a!.sireCode));
      return (
        <button
          type="button"
          className={`sched-card empty${solo ? " blocked" : ""}${
            targeting && !solo ? " target" : ""
          }`}
          onClick={() => tapSlot(i, lane, !!solo)}
        >
          {solo ? "第二 使用不可" : targeting ? "ここへ" : "空き"}
        </button>
      );
    }
    const fo = firstOnly(m);
    const k = noteKind(m.note);
    const code = normCode(m.sireCode);
    const e = earliest[code];
    const bad4h = e != null && startMins[i] < e;
    const early = showEarly ? earlyFinishPick(rounds, i, lane, opts) : null;
    return (
      <button
        type="button"
        className={`sched-card tappable${isSel ? " sel" : ""}${
          targeting ? " target" : ""
        }`}
        onClick={() => tapSlot(i, lane, false)}
      >
        <div className="sched-card-main">
          <Badge code={m.sireCode} />
          <div className="sched-card-txt">
            {(fixedCallTime(m.id) || fo || k === "agari-re") && (
              <div className="sched-mare">
                {fixedCallTime(m.id) && (
                  <span className="fixed-tag">📌{fixedCallTime(m.id)}</span>
                )}
                {fo && <span className="first-tag">{fo}</span>}
                {k === "agari-re" && (
                  <span className="first-tag re">上り再発</span>
                )}
              </div>
            )}
            <div className="sched-sire">
              {optionGroomOf(m.sireCode, opts) && (
                <span className="sched-groom">
                  👤{optionGroomOf(m.sireCode, opts)}
                </span>
              )}
              {barnOf(m.sireCode) && (
                <span className="sched-barn">{barnOf(m.sireCode)}</span>
              )}
              <span className="sched-dur">
                {opts.durations[code] || opts.defaultDur}分
              </span>
            </div>
            {m.note && !["agari", "sedate", "agari-re"].includes(k) && (
              <div className="sched-note">{m.note}</div>
            )}
            {e != null && (
              <div className={`gap-info${bad4h ? " bad" : ""}`}>
                {bad4h ? "⚠ " : "🕒 "}
                {fmtTime(e)}以降OK（前回{fmtTime(e - opts.gapMin)}）
              </div>
            )}
            {early && (
              <div className="early-pick">
                💡早く終わったら→{normCode(early.sireCode)}
              </div>
            )}
          </div>
        </div>
        {isSel ? (
          <span className="sched-selmark">選択中</span>
        ) : (
          targeting && <span className="sched-selmark ghost">入替</span>
        )}
      </button>
    );
  }

  return (
    <div className="app board-app">
      <div className="topbar">
        <h1>
          🗓️ 種付順番・呼び出し
          <span className="sub">どの馬を何時に呼ぶか</span>
        </h1>
        <Link href="/board" className="btn btn-ghost">
          📍 所在ボードへ
        </Link>
        <Link href="/" className="btn btn-ghost">
          🚚 馬積みへ
        </Link>
      </div>

      {/* 操作パネル */}
      <section className="roster-panel">
        <div className="roster-head">
          <span className="roster-title">
            📋 対象の組
            <span className="group-tabs">
              {ROSTER_GROUPS.map((g) => (
                <button
                  key={g.key}
                  className={`group-tab ${group === g.key ? "on" : ""}`}
                  onClick={() => setGroup(g.key)}
                >
                  {g.key}
                  <span className="group-time">{g.time}</span>
                </button>
              ))}
            </span>
          </span>
          <div className="roster-actions">
            <button
              className={`btn btn-sm ${showRules ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowRules((v) => !v)}
            >
              🎌 この日のルール{ruleCount ? `（${ruleCount}）` : ""}
            </button>
            <button
              className="btn btn-primary btn-generate"
              onClick={generate}
              disabled={matings.length === 0}
            >
              🚀 {rounds.length ? "この内容で組み直す" : "生成する"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRounds(trimEmpty(rounds))}
            >
              ▮ 空きを詰める
            </button>
            <button
              className={`btn btn-sm ${showCall ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowCall((v) => !v)}
            >
              📞 呼び出し表
            </button>
            <button
              className={`btn btn-sm ${showEarly ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowEarly((v) => !v)}
            >
              💡 早終わり候補
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMap((v) => !v)}
            >
              🗺 厩舎マップ{showMap ? "を隠す" : ""}
            </button>
          </div>
        </div>
        <div className="sched-config">
          <label>
            開始
            <input
              type="time"
              step={900}
              value={start.padStart(5, "0")}
              onChange={(e) => setStart(quarterTime(e.target.value))}
            />
          </label>
          <label>
            既定の所要
            <input
              type="number"
              min={1}
              max={90}
              value={opts.defaultDur}
              onChange={(e) =>
                applyOpts({
                  ...opts,
                  defaultDur: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
            分
          </label>
          <label title="同じ種牡馬の種付と種付の間にあける時間">
            種付間隔
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={opts.gapMin / 60}
              onChange={(e) =>
                applyOpts({
                  ...opts,
                  gapMin: Math.max(0, Math.round((Number(e.target.value) || 0) * 60)),
                })
              }
            />
            時間
          </label>
          <label title="呼び出しから種付までの準備（待機＋洗い場）">
            呼出リード
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={opts.prepMin}
              onChange={(e) =>
                applyOpts({
                  ...opts,
                  prepMin: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
            分前
          </label>
          <span className="sched-stat">
            種付 {scheduled}頭 ／ {rounds.length}コマ
          </span>
          <span className={`sched-stat ${badRounds ? "bad" : "ok"}`}>
            {badRounds ? `⚠ 要確認 ${badRounds}コマ` : "✓ 被りなし"}
          </span>
          <span className={`sched-stat ${ldkFirst ? "ok" : "bad"}`}>
            {ldkFirst ? "✓ カナロア先頭" : "⚠ カナロア先頭でない"}
          </span>
        </div>
      </section>

      {/* この日のルール */}
      {showRules && (
        <section className="rules-panel">
          <div className="rules-hint">
            種牡馬ごとに <b>順番</b>・<b>所要（分）</b> を設定できます。設定したら下の
            <b>🚀 生成する</b>を押してください（ここでの変更はまだ反映されません）。
            ※上り初回・鎮静は自動で第一に固定、連続禁止の担当者は必ず避けて組みます。
          </div>
          <label className="ldk-solo">
            <input
              type="checkbox"
              checked={opts.solo.includes("LDK")}
              onChange={() => toggleSolo("LDK")}
            />
            ロードカナロアの種付中は第二種付所を使わない（単独）
          </label>
          <div className="rules-grid">
            {groupCodes.map((c) => (
              <div
                className={`rule-row${
                  opts.priorities[c] ||
                  opts.durations[c] ||
                  opts.groomOverrides?.[c] != null
                    ? " set"
                    : ""
                }`}
                key={c}
              >
                <Badge code={c} />
                <select
                  className="rule-groom"
                  value={
                    Object.prototype.hasOwnProperty.call(
                      opts.groomOverrides || {},
                      c
                    )
                      ? opts.groomOverrides[c]
                      : "__default"
                  }
                  onChange={(e) => setGroom(c, e.target.value)}
                  title="担当を変更"
                >
                  <option value="__default">
                    {groomOf(c) || "担当なし"}
                  </option>
                  <option value="">担当なし</option>
                  {allGrooms.map((g) => (
                    <option value={g} key={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <select
                  value={opts.priorities[c] || ""}
                  onChange={(e) => setPriority(c, e.target.value as Priority | "")}
                >
                  <option value="">普通</option>
                  {PRIORITY_ORDER.map((p) => (
                    <option value={p} key={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
                <input
                  className="rule-dur"
                  type="number"
                  min={1}
                  max={90}
                  placeholder={String(opts.defaultDur)}
                  value={opts.durations[c] || ""}
                  onChange={(e) =>
                    setDuration(c, e.target.value ? Number(e.target.value) : null)
                  }
                />
                <span className="rule-dur-u">分</span>
              </div>
            ))}
          </div>
          <div className="rules-grooms">
            <span className="rules-sub">連続で入れない担当者：</span>
            {groupGrooms.map((g) => (
              <label
                key={g}
                className={`groom-chip${
                  opts.noConsecGrooms.includes(g) ? " on" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={opts.noConsecGrooms.includes(g)}
                  onChange={() => toggleGroom(g)}
                />
                {g}
              </label>
            ))}
            {groupGrooms.length === 0 && <span className="rules-sub">—</span>}
          </div>
          <div className="prefixed-call-panel">
            <div className="prefixed-call-head">
              <span>事前に呼ぶ時間が決まっている馬</span>
              <span className="prefixed-call-note">
                呼ぶ時刻を入れてから生成すると、その時刻を基準に固定します。
              </span>
            </div>
            <div className="prefixed-call-rows">
              {matings.map((m) => {
                const callFixed = fixedCallTime(m.id);
                return (
                  <div
                    className={`prefixed-call-row${callFixed ? " fixed" : ""}`}
                    key={m.id}
                  >
                    <Badge code={m.sireCode} />
                    {optionGroomOf(m.sireCode, opts) && (
                      <span className="prefixed-call-groom">
                        {optionGroomOf(m.sireCode, opts)}
                      </span>
                    )}
                    <span className="prefixed-call-input">
                      <input
                        type="time"
                        step={900}
                        value={callFixed}
                        onChange={(e) => setFixedCallTime(m.id, e.target.value)}
                      />
                      {callFixed && (
                        <button
                          type="button"
                          className="call-fix-clear"
                          onClick={() => setFixedCallTime(m.id, "")}
                          title="固定解除"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 厩舎マップ */}
      {showMap && (
        <section className="barn-map">
          {BARNS.map((bn) => {
            const list = STALLIONS.filter((s) => s.barn === bn).sort(
              (a, b) => a.row - b.row || a.col - b.col
            );
            const rowsY = Array.from(new Set(list.map((s) => s.row))).sort(
              (a, b) => a - b
            );
            const active = new Set(matings.map((m) => normCode(m.sireCode)));
            return (
              <div className="barn-box" key={bn}>
                <div className="barn-name">{bn}</div>
                {rowsY.map((y) => (
                  <div className="barn-row" key={y}>
                    {list
                      .filter((s) => s.row === y)
                      .map((s) => (
                        <div
                          className={`stall${active.has(s.code) ? " on" : ""}`}
                          key={s.code}
                        >
                          <Badge code={s.code} />
                          <div className="stall-txt">
                            <div className="stall-name">{s.name}</div>
                            {s.groom && (
                              <div className="stall-groom">👤{s.groom}</div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            );
          })}
          <p className="barn-hint">
            ※ 同じ厩舎で隣・正面・斜めの馬房は同時に種付しない前提で組んでいます。
          </p>
        </section>
      )}

      {/* 呼び出し表（時刻順・誰を何時に呼ぶか） */}
      {showCall && rounds.length === 0 && (
        <section className="call-sheet">
          <div className="call-head">📞 呼び出し表（時刻順）</div>
          <p className="barn-hint">まだ生成していません。上の「🚀 生成する」を押すと表示されます。</p>
        </section>
      )}
      {showCall && rounds.length > 0 && (
        <section className="call-sheet">
          <div className="call-head">
            📞 呼び出し表（時刻順）
            <span className="call-note">
              入力した呼ぶ時刻を基に、種付時刻を固定して「この内容で組み直す」
            </span>
          </div>
          <div className="call-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={generate}
            >
              この内容で組み直す
            </button>
          </div>
          <div className="call-legend">
            <span>呼ぶ</span>
            <span>種付</span>
            <span>牝馬・種牡馬</span>
            <span>固定呼出</span>
          </div>
          <div className="call-rows">
            {rounds.flatMap((r, i) =>
              (["a", "b"] as const)
                .map((ln) => r[ln])
                .filter((m): m is Mating => !!m)
                .map((m) => {
                  const fo = firstOnly(m);
                  const callFixed = fixedCallTime(m.id);
                  const isFixed = !!callFixed;
                  return (
                    <div
                      className={`call-row${isFixed ? " fixed" : ""}`}
                      key={m.id}
                    >
                      <span className="call-time">
                        {fmtTime(startMins[i] - opts.prepMin)}
                      </span>
                      <span className="call-mate">種付 {times[i]}</span>
                      <span className="call-mid">
                        <Badge code={m.sireCode} />
                        {optionGroomOf(m.sireCode, opts) && (
                          <span className="call-groom">
                            👤{optionGroomOf(m.sireCode, opts)}
                          </span>
                        )}
                        {fo && <span className="first-tag">{fo}</span>}
                      </span>
                      <span className="call-fix">
                        <input
                          type="time"
                          step={900}
                          value={callFixed}
                          onChange={(e) => setFixedCallTime(m.id, e.target.value)}
                        />
                        {isFixed && (
                          <button
                            className="call-fix-clear"
                            onClick={() => setFixedCallTime(m.id, "")}
                            title="固定解除"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
        </section>
      )}

      {/* 未生成：ルールを選んで生成を促す */}
      {rounds.length === 0 && matings.length > 0 && (
        <section className="generate-cta">
          <div className="generate-cta-txt">
            <b>まだ何も組んでいません。</b>
            🎌の日のルール（順番・単独・所要・連続禁止担当者）を確認・設定してから、
            <b>🚀 生成する</b>を押してください。被り・4時間間隔・連続禁止の担当者は必ず避けて組みます。
          </div>
          <button className="btn btn-primary btn-generate" onClick={generate}>
            🚀 生成する（{matings.length}頭）
          </button>
        </section>
      )}

      {/* タイムライン */}
      <section className="sched-timeline">
        {rounds.length > 0 && (
          <>
            <div className={`tap-hint${sel ? " active" : ""}`}>
              {sel
                ? "入れ替え先のカード（または空き枠）をタップ。もう一度同じカードで取消。"
                : "👆 カードをタップ→もう1枚タップで入れ替えできます。"}
            </div>
            <div className="sched-legend">
              <span>時刻</span>
              <span>第一種付所</span>
              <span>第二種付所</span>
            </div>
          </>
        )}
        {rounds.map((r, i) => {
          const iss = issuesByRound[i];
          const gap = gapBad[i];
          const bad = iss.length > 0 || gap.length > 0;
          return (
            <div className={`sched-round${bad ? " bad" : ""}`} key={i}>
              <div className="sched-time">
                <span className="sched-no">{i + 1}</span>
                {times[i]}
                <span className="sched-len">{roundMinutes(r, opts)}分</span>
              </div>
              <Card m={r.a} i={i} lane="a" />
              <Card m={r.b} i={i} lane="b" />
              {bad && (
                <div className="sched-warn">
                  ⚠{" "}
                  {[
                    ...iss.map((x) => ISSUE_LABEL[x]),
                    ...gap.map(
                      (g) => `${g.code}は種付間隔${opts.gapMin / 60}h未満`
                    ),
                  ].join("・")}
                </div>
              )}
            </div>
          );
        })}
        {rounds.length === 0 && matings.length === 0 && (
          <p className="barn-hint">
            この組の予定がありません。所在ボードで順番表を確認してください。
          </p>
        )}
      </section>
    </div>
  );
}
