"use client";

// 表示専用ページ：会議室のモニターやiPadで、操作ページで組んだ順番表をそのまま映す。
// 操作はできない（組の切替だけ）。操作ページが組み直すと数秒で置き換わる。
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconWarn } from "@/app/components/Icon";
import { GroupKey, ROSTER_GROUPS, sireBadge, normCode } from "@/lib/board";
import {
  cloudEnabled,
  subscribeSchedule,
  subscribeScheduleCurrent,
  SchedDoc,
  SchedRow,
} from "@/lib/cloud";

const KEY_STORAGE = "mare-transport-access-key";

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

function fmtUpdated(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DisplayPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [current, setCurrent] = useState<{ day: string; group: GroupKey } | null>(null);
  const [docData, setDocData] = useState<SchedDoc | null>(null);
  const [group, setGroup] = useState<GroupKey | null>(null); // 手で選んだ組（未選択なら操作ページに追従）
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAccessKey(localStorage.getItem(KEY_STORAGE));
  }, []);

  // 「今出している日」を追いかける
  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let unsub = () => {};
    subscribeScheduleCurrent(accessKey, (cur) => {
      setConnected(true);
      setCurrent(cur);
    })
      .then((u) => {
        if (u) unsub = u;
      })
      .catch(() => {});
    return () => unsub();
  }, [accessKey]);

  // その日の順番表を購読
  useEffect(() => {
    if (!cloudEnabled || !accessKey || !current?.day) return;
    let unsub = () => {};
    subscribeSchedule(accessKey, current.day, (d) => setDocData(d))
      .then((u) => {
        if (u) unsub = u;
      })
      .catch(() => {});
    return () => unsub();
  }, [accessKey, current?.day]);

  const shownGroup: GroupKey = group ?? current?.group ?? "朝";
  const pub = docData?.groups?.[shownGroup];
  const rows: SchedRow[] = useMemo(() => pub?.rows ?? [], [pub]);
  const availableGroups = ROSTER_GROUPS.filter((g) => docData?.groups?.[g.key]?.rows?.length);

  function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(KEY_STORAGE, k);
    setAccessKey(k);
  }

  if (!accessKey) {
    return (
      <div className="display-app">
        <div className="display-bar">
          <h1>種付順番（表示）</h1>
        </div>
        <div className="display-key">
          <input
            type="text"
            placeholder="合言葉"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveKey()}
          />
          <button className="btn btn-primary" onClick={saveKey}>
            表示する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="display-app">
      <div className="display-bar">
        <h1>種付順番</h1>
        {current?.day && (
          <span className="display-day">{current.day.replace("-", "/")}</span>
        )}
        <span className="group-tabs">
          {ROSTER_GROUPS.map((g) => (
            <button
              key={g.key}
              className={`group-tab ${shownGroup === g.key ? "on" : ""}`}
              onClick={() => setGroup(g.key)}
              disabled={!docData?.groups?.[g.key]?.rows?.length}
              title={docData?.groups?.[g.key]?.rows?.length ? "" : "まだ組まれていません"}
            >
              {g.key}
              <span className="group-time">{g.time}</span>
            </button>
          ))}
        </span>
        <span className="display-updated">
          {pub ? `更新 ${fmtUpdated(pub.updatedAt)}` : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="display-empty">
          {!current
            ? "操作ページでまだ順番が組まれていません。"
            : `${shownGroup}の組はまだ組まれていません。${
                availableGroups.length ? "上の組を選んでください。" : ""
              }`}
        </div>
      ) : (
        <table className="sched-table">
          <thead>
            <tr>
              <th className="t-no">順</th>
              <th>呼ぶ</th>
              <th>種付</th>
              <th>場</th>
              <th>種牡馬</th>
              <th>牝馬</th>
              <th>担当</th>
              <th>印</th>
              <th>確認</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`${r.empty ? "empty" : ""}${r.bad ? " bad" : ""}`}
              >
                <td className="t-no">{r.no}</td>
                <td className="t-call">{r.empty ? "" : r.call}</td>
                <td className="t-mate">{r.mate}</td>
                <td className="t-lane">{r.lane === "a" ? "第一" : "第二"}</td>
                {r.empty ? (
                  <td colSpan={5}>空き</td>
                ) : (
                  <>
                    <td>
                      <Badge code={r.sireCode} />
                    </td>
                    <td className="t-mare">{r.mareName}</td>
                    <td className={r.groom ? (r.groomOff ? "t-off" : "") : "t-unknown"}>
                      {r.groom || "担当者不明"}
                      {r.groomOff ? "(休)" : ""}
                    </td>
                    <td>
                      <span className="t-tags">
                        {r.tags.map((t, i) => (
                          <span key={i} className={t.k}>
                            {t.t}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="t-warn">
                      {r.warn && (
                        <>
                          <IconWarn size={12} />
                          {r.warn}
                        </>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="display-foot">
        <span className={`sync-chip ${connected ? "on" : ""}`}>
          {connected ? `同期中：${accessKey}` : "接続中…"}
        </span>
        {pub && <span>{pub.headCount}頭・開始 {pub.start}</span>}
        <Link href="/schedule" style={{ marginLeft: "auto" }}>
          操作ページへ
        </Link>
      </div>
    </div>
  );
}
