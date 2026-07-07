"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GroupKey,
  ROSTER_GROUPS,
  groupRoster,
  sireBadge,
  normCode,
} from "@/lib/board";
import { STALLIONS, BARNS, stallionName, groomOf, barnOf } from "@/lib/barns";
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
  roundMinutes,
  earlyFinishPick,
  firstOnly,
  swapSlots,
  trimEmpty,
} from "@/lib/schedule";

const START_BY_GROUP: Record<GroupKey, string> = {
  朝: "8:00",
  昼: "13:00",
  夕: "17:00",
};

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
  const [showRules, setShowRules] = useState(false);
  const [showEarly, setShowEarly] = useState(false);
  const [opts, setOpts] = useState<Options>(defaultOptions());
  const [sel, setSel] = useState<{ i: number; lane: "a" | "b" } | null>(null);

  const matings: Mating[] = useMemo(
    () =>
      groupRoster(group).map((r) => ({
        id: r.id,
        mareName: r.mareName,
        sireCode: r.sireCode,
        note: r.note,
      })),
    [group]
  );

  // オプション復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sched:opts");
    if (saved) {
      try {
        setOpts({ ...defaultOptions(), ...JSON.parse(saved) });
      } catch {}
    }
  }, []);

  // 組の切替：開始時刻を既定にし、保存があれば復元・無ければ自動生成
  useEffect(() => {
    setStart(START_BY_GROUP[group]);
    let restored = false;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sched:" + group);
      if (saved) {
        try {
          setRounds(JSON.parse(saved));
          restored = true;
        } catch {}
      }
    }
    if (!restored) setRounds(autoSchedule(matings, opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  // コマ保存
  useEffect(() => {
    if (typeof window !== "undefined" && rounds.length)
      localStorage.setItem("sched:" + group, JSON.stringify(rounds));
  }, [rounds, group]);

  // オプション変更→保存＆即組み直し
  function applyOpts(next: Options) {
    setSel(null);
    setOpts(next);
    if (typeof window !== "undefined")
      localStorage.setItem("sched:opts", JSON.stringify(next));
    setRounds(autoSchedule(matings, next));
  }
  function setPriority(code: string, p: Priority | "") {
    const pr = { ...opts.priorities };
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

  function rebuild() {
    setSel(null);
    setRounds(autoSchedule(matings, opts));
  }

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
        .map((m) => groomOf((m as Mating).sireCode));
      return iss;
    });
  }, [rounds, opts]);
  const badRounds = issuesByRound.filter((x) => x.length).length;
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
  const groupGrooms = useMemo(() => {
    const seen: string[] = [];
    for (const c of groupCodes) {
      const g = groomOf(c);
      if (g && !seen.includes(g)) seen.push(g);
    }
    return seen.sort();
  }, [groupCodes]);
  const ruleCount =
    groupCodes.filter((c) => opts.priorities[c]).length +
    opts.solo.length +
    Object.keys(opts.durations).length +
    opts.noConsecGrooms.length;

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
            <div className="sched-mare">
              {m.mareName || "（牝馬未定）"}
              {fo && <span className="first-tag">第一{fo}</span>}
            </div>
            <div className="sched-sire">
              {stallionName(m.sireCode)}
              {groomOf(m.sireCode) && (
                <span className="sched-groom">👤{groomOf(m.sireCode)}</span>
              )}
              {barnOf(m.sireCode) && (
                <span className="sched-barn">{barnOf(m.sireCode)}</span>
              )}
              <span className="sched-dur">
                {opts.durations[normCode(m.sireCode)] || opts.defaultDur}分
              </span>
            </div>
            {m.note && <div className="sched-note">{m.note}</div>}
            {early && (
              <div className="early-pick">
                💡早く終わったら→{early.mareName || stallionName(early.sireCode)}
                （{normCode(early.sireCode)}）
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
          🗓️ 種付順番
          <span className="sub">馬房・担当者が被らない並び</span>
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
            <button className="btn btn-primary btn-sm" onClick={rebuild}>
              ⟳ 自動で組み直す
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRounds(trimEmpty(rounds))}
            >
              ▮ 空きを詰める
            </button>
            <button
              className={`btn btn-sm ${showRules ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowRules((v) => !v)}
            >
              🎌 この日のルール{ruleCount ? `（${ruleCount}）` : ""}
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
              value={start.padStart(5, "0")}
              onChange={(e) => setStart(e.target.value)}
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
            種牡馬ごとに <b>順番</b>・<b>単独（第二を使わない）</b>・<b>所要（分）</b> を設定できます。
            変更すると即組み直します（手動調整はリセット）。※上り初回・鎮静は自動で第一に固定。
          </div>
          <div className="rules-grid">
            {groupCodes.map((c) => (
              <div
                className={`rule-row${
                  opts.priorities[c] ||
                  opts.solo.includes(c) ||
                  opts.durations[c]
                    ? " set"
                    : ""
                }`}
                key={c}
              >
                <Badge code={c} />
                <span className="rule-name">{stallionName(c)}</span>
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
                <label className="rule-solo" title="種付中は第二を使わない">
                  <input
                    type="checkbox"
                    checked={opts.solo.includes(c)}
                    onChange={() => toggleSolo(c)}
                  />
                  単独
                </label>
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

      {/* タイムライン */}
      <section className="sched-timeline">
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
        {rounds.map((r, i) => {
          const iss = issuesByRound[i];
          return (
            <div className={`sched-round${iss.length ? " bad" : ""}`} key={i}>
              <div className="sched-time">
                <span className="sched-no">{i + 1}</span>
                {times[i]}
                <span className="sched-len">{roundMinutes(r, opts)}分</span>
              </div>
              <Card m={r.a} i={i} lane="a" />
              <Card m={r.b} i={i} lane="b" />
              {iss.length > 0 && (
                <div className="sched-warn">
                  ⚠ {iss.map((x) => ISSUE_LABEL[x]).join("・")}
                </div>
              )}
            </div>
          );
        })}
        {rounds.length === 0 && (
          <p className="barn-hint">
            この組の予定がありません。所在ボードで順番表を確認してください。
          </p>
        )}
      </section>
    </div>
  );
}
