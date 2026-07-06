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
import {
  STALLIONS,
  BARNS,
  stallionName,
  groomOf,
  barnOf,
} from "@/lib/barns";
import {
  Mating,
  Round,
  autoSchedule,
  roundConflict,
  slotTime,
  swapLane,
  moveCard,
  trimEmpty,
  CONFLICT_LABEL,
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
  const [step, setStep] = useState(15);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [showMap, setShowMap] = useState(false);

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
    if (!restored) setRounds(autoSchedule(matings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  // 保存
  useEffect(() => {
    if (typeof window !== "undefined" && rounds.length)
      localStorage.setItem("sched:" + group, JSON.stringify(rounds));
  }, [rounds, group]);

  const conflicts = rounds.filter((r) => roundConflict(r)).length;
  const scheduled = rounds.reduce(
    (n, r) => n + (r.a ? 1 : 0) + (r.b ? 1 : 0),
    0
  );
  const ldkFirst =
    rounds.length > 0 &&
    (normCode(rounds[0].a?.sireCode || "") === "LDK" ||
      normCode(rounds[0].b?.sireCode || "") === "LDK");

  function rebuild() {
    setRounds(autoSchedule(matings));
  }

  function Card({
    m,
    i,
    lane,
  }: {
    m?: Mating;
    i: number;
    lane: "a" | "b";
  }) {
    if (!m) return <div className="sched-card empty">空き</div>;
    return (
      <div className="sched-card">
        <div className="sched-card-main">
          <Badge code={m.sireCode} />
          <div className="sched-card-txt">
            <div className="sched-mare">{m.mareName || "（牝馬未定）"}</div>
            <div className="sched-sire">
              {stallionName(m.sireCode)}
              {groomOf(m.sireCode) && (
                <span className="sched-groom">👤{groomOf(m.sireCode)}</span>
              )}
              {barnOf(m.sireCode) && (
                <span className="sched-barn">{barnOf(m.sireCode)}</span>
              )}
            </div>
            {m.note && <div className="sched-note">{m.note}</div>}
          </div>
        </div>
        <div className="sched-ops">
          <button
            title="1つ上へ"
            onClick={() => setRounds(moveCard(rounds, i, lane, -1))}
          >
            ▲
          </button>
          <button
            title="1つ下へ"
            onClick={() => setRounds(moveCard(rounds, i, lane, 1))}
          >
            ▼
          </button>
          <button title="左右入替" onClick={() => setRounds(swapLane(rounds, i))}>
            ⇄
          </button>
        </div>
      </div>
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
            1コマ
            <input
              type="number"
              min={1}
              max={90}
              value={step}
              onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))}
            />
            分
          </label>
          <span className="sched-stat">
            種付 {scheduled}頭 ／ {rounds.length}コマ
          </span>
          <span className={`sched-stat ${conflicts ? "bad" : "ok"}`}>
            {conflicts ? `⚠ 被り ${conflicts}件` : "✓ 被りなし"}
          </span>
          <span className={`sched-stat ${ldkFirst ? "ok" : "bad"}`}>
            {ldkFirst ? "✓ カナロア先頭" : "⚠ カナロア先頭でない"}
          </span>
        </div>
      </section>

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
        <div className="sched-legend">
          <span>時刻</span>
          <span>第一種付所</span>
          <span>第二種付所</span>
        </div>
        {rounds.map((r, i) => {
          const conf = roundConflict(r);
          return (
            <div className={`sched-round${conf ? " bad" : ""}`} key={i}>
              <div className="sched-time">
                <span className="sched-no">{i + 1}</span>
                {slotTime(start, step, i)}
              </div>
              <Card m={r.a} i={i} lane="a" />
              <Card m={r.b} i={i} lane="b" />
              {conf && (
                <div className="sched-warn">⚠ {CONFLICT_LABEL[conf]}</div>
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
