"use client";

// 見る専用の所在ボード（掲示板型）。会議室のモニターやiPadに出しっぱなしにする前提。
// 操作は一切なし。所在ボードと馬積みアプリの同期データをそのまま映す。
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconWarn } from "@/app/components/Icon";
import {
  Mare,
  RosterEntry,
  Zone,
  GroupKey,
  ROSTER_GROUPS,
  sireBadge,
  normCode,
  cardClass,
  stayMinutes,
  resolveMareName,
  resolveNote,
} from "@/lib/board";
import { Vehicle, effBatch } from "@/lib/types";
import { cloudEnabled, subscribeBoard, subscribeYard } from "@/lib/cloud";
import { stallionName } from "@/lib/barns";

const KEY_STORAGE = "mare-transport-access-key";
const STAY_WARN_MIN = 60;

type Card = {
  key: string;
  sireCode: string;
  mareName: string;
  farm?: string;
  kind?: string;
  note?: string;
  since?: number; // 滞在の起点（ms）
  sinceLabel: string; // 「滞在」「入室」など
  tags: string[]; // 補足（予備・2頭同時・処置・状態タグ）
};

function Badge({ code }: { code: string }) {
  const b = sireBadge(code);
  return (
    <span
      className={`chip-sire${b.twoTone ? " twotone" : ""}`}
      style={{ background: b.background, color: b.color }}
    >
      {normCode(code) || "?"}
    </span>
  );
}

function NoteTags({ note }: { note?: string }) {
  if (!note) return null;
  const tags: { t: string; k: string }[] = [];
  if (note.includes("鎮静")) tags.push({ t: "鎮静", k: "sedate" });
  if (note.includes("上り再発") || note.includes("再発")) tags.push({ t: "上り再発", k: "agari-re" });
  else if (note.includes("上り")) tags.push({ t: "上り", k: "agari" });
  if (note.toUpperCase().includes("OV")) tags.push({ t: "OV", k: "ov" });
  if (!tags.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span key={tag.k} className={`mare-note note-${tag.k}`}>
          {tag.t}
        </span>
      ))}
    </>
  );
}

// 経過時間の表記：60分以上は「1時間12分」、丸1日を超えたら「1日以上」
function fmtDur(min: number): string {
  if (min >= 24 * 60) return "1日以上";
  if (min >= 60) return `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, "0")}分`;
  return `${min}分`;
}

function CardView({ c, now, big }: { c: Card; now: number; big?: boolean }) {
  const min = stayMinutes(c.since, now);
  const warn = min != null && min >= STAY_WARN_MIN && c.sinceLabel === "滞在";
  return (
    <div className={`dsp-card ${cardClass(c.note)}${big ? " big" : ""}`}>
      <Badge code={c.sireCode} />
      <div className="dsp-card-body">
        <div className="dsp-card-name">{c.mareName}</div>
        <div className="dsp-card-sub">
          {big && <span className="dsp-sire-name">{stallionName(c.sireCode)}</span>}
          {c.farm && <span>{c.farm}</span>}
          {c.kind && <span className="mare-kind">{c.kind}</span>}
          <NoteTags note={c.note} />
          {c.tags.map((t) => (
            <span key={t} className="dsp-tag">
              {t}
            </span>
          ))}
        </div>
      </div>
      {min != null && (
        <div className={`dsp-card-time${warn ? " warn" : ""}`}>
          {warn && <IconWarn size={12} />}
          {fmtDur(min)}<small>{c.sinceLabel}</small>
        </div>
      )}
    </div>
  );
}

function ZoneTile({
  name,
  cards,
  now,
  kind,
  showNext,
}: {
  name: string;
  cards: Card[];
  now: number;
  kind?: "mate" | "wait";
  showNext?: boolean;
}) {
  return (
    <section className={`dsp-zone${kind ? " " + kind : ""}`}>
      <div className="dsp-zone-head">
        <span>{name}</span>
        <span className="cnt">{cards.length}</span>
      </div>
      {cards.length === 0 ? (
        <div className="dsp-empty">—</div>
      ) : (
        <div className="dsp-cards">
          {cards.map((c, i) => (
            <div key={c.key} className="dsp-card-wrap">
              {showNext && i === 0 && <span className="dsp-next">次</span>}
              <CardView c={c} now={now} big={kind === "mate"} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function DisplayBoardPage() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [mares, setMares] = useState<Mare[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [group, setGroup] = useState<GroupKey | undefined>(undefined);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAccessKey(localStorage.getItem(KEY_STORAGE));
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let u1 = () => {};
    let u2 = () => {};
    subscribeBoard(accessKey, (d) => {
      setConnected(true);
      setMares(d?.mares ?? []);
      setRoster(d?.roster ?? []);
      setGroup(d?.group);
    })
      .then((u) => {
        if (u) u1 = u;
      })
      .catch(() => {});
    subscribeYard(accessKey, (v) => setVehicles(v ?? []))
      .then((u) => {
        if (u) u2 = u;
      })
      .catch(() => {});
    return () => {
      u1();
      u2();
    };
  }, [accessKey]);

  // 馬積場（馬積みアプリの駐車枠＋手で置いた馬）
  const advancedRefs = useMemo(
    () => new Set(mares.map((m) => m.parkingRef).filter(Boolean)),
    [mares]
  );
  const yardCards: Card[] = useMemo(() => {
    const out: Card[] = [];
    vehicles.forEach((v) => {
      if (v.wentHome || v.parkingNo == null) return;
      const batch = effBatch(v);
      v.horses.forEach((h) => {
        if (h.unloadStatus === "unloaded") return;
        const ref = `${v.id}:${h.id}`;
        if (advancedRefs.has(ref)) return;
        out.push({
          key: ref,
          sireCode: h.horseCode,
          mareName: resolveMareName(roster, h.horseCode) || h.horseName || h.horseCode,
          note: resolveNote(roster, h.horseCode) || undefined,
          since: v.arrivedTs,
          sinceLabel: "滞在",
          tags: [`枠${v.parkingNo}`, ...(batch > 1 ? [`${batch}頭同時`] : [])],
        });
      });
    });
    mares
      .filter((m) => m.zone === "馬積場" || m.zone === "予備（馬積）")
      .forEach((m) =>
        out.push({
          key: m.id,
          sireCode: m.sireCode,
          mareName: m.mareName || "（名前未入力）",
          farm: m.farm,
          kind: m.kind,
          note: m.note,
          since: m.enteredTs,
          sinceLabel: "滞在",
          tags: [
            ...(m.zone === "予備（馬積）" ? ["予備"] : m.frameNo ? [`枠${m.frameNo}`] : []),
            ...(m.treats ?? []),
            ...m.tags,
          ],
        })
      );
    return out;
  }, [vehicles, advancedRefs, roster, mares]);

  const byZone = useMemo(() => {
    const map = new Map<Zone, Card[]>();
    mares.forEach((m) => {
      if (m.zone === "馬積場" || m.zone === "予備（馬積）") return;
      const inMate = m.zone === "第一種付所" || m.zone === "第二種付所";
      const c: Card = {
        key: m.id,
        sireCode: m.sireCode,
        mareName: m.mareName || "（名前未入力）",
        farm: m.farm,
        kind: m.kind,
        note: m.note,
        since: inMate ? m.matedTs ?? m.enteredTs : m.zone === "帰宅" ? undefined : m.enteredTs,
        sinceLabel: inMate ? "入室" : "滞在",
        tags: [...(m.treats ?? []), ...m.tags],
      };
      const arr = map.get(m.zone) ?? [];
      arr.push(c);
      map.set(m.zone, arr);
    });
    // 待機は先に来た順（次に入る馬が先頭）
    map.get("待機")?.sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    return map;
  }, [mares]);
  const z = (name: Zone) => byZone.get(name) ?? [];

  // 未着の予定
  const presentCodes = useMemo(() => {
    const s = new Set<string>();
    yardCards.forEach((c) => s.add(normCode(c.sireCode)));
    mares.forEach((m) => s.add(normCode(m.sireCode)));
    return s;
  }, [yardCards, mares]);
  const pending = useMemo(
    () => roster.filter((r) => !presentCodes.has(normCode(r.sireCode))),
    [roster, presentCodes]
  );

  const onSite =
    yardCards.length +
    (["洗い場", "待機馬房", "待機", "第一種付所", "第二種付所", "P検待ち・直検待ち", "鎮静待ち"] as Zone[])
      .reduce((n, zn) => n + z(zn).length, 0);
  const mated = mares.filter((m) => m.matedTs).length;

  function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(KEY_STORAGE, k);
    setAccessKey(k);
  }

  const d = new Date(now || Date.now());
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
  const clock = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const groupLabel = group ? `${group} ${ROSTER_GROUPS.find((g) => g.key === group)?.time ?? ""}` : "";

  if (!accessKey) {
    return (
      <div className="dsp">
        <div className="dsp-bar">
          <h1>所在ボード</h1>
        </div>
        <div className="dsp-key">
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
    <div className="dsp">
      <div className="dsp-bar">
        <h1>所在ボード</h1>
        <span className="dsp-date">{dateLabel}</span>
        {groupLabel && <span className="dsp-group">{groupLabel}</span>}
        <span className="dsp-clock">{clock}</span>
        <span className={`sync-chip ${connected ? "on" : ""}`}>
          {connected ? "同期中" : "接続中…"}
        </span>
      </div>

      <div className="dsp-stats">
        <span className="dsp-stat">到着待ち <b>{pending.length}</b></span>
        <span className="dsp-stat">場内 <b>{onSite}</b></span>
        <span className="dsp-stat">種付済 <b>{mated}</b></span>
        <span className="dsp-stat">帰宅 <b>{z("帰宅").length}</b></span>
      </div>

      <div className="dsp-row two">
        <ZoneTile name="第一種付所" cards={z("第一種付所")} now={now} kind="mate" />
        <ZoneTile name="第二種付所" cards={z("第二種付所")} now={now} kind="mate" />
      </div>
      <ZoneTile name="待機" cards={z("待機")} now={now} kind="wait" showNext />
      <div className="dsp-row three">
        <ZoneTile name="馬積場" cards={yardCards} now={now} />
        <ZoneTile name="洗い場" cards={z("洗い場")} now={now} />
        <ZoneTile name="待機馬房" cards={z("待機馬房")} now={now} />
      </div>
      <div className="dsp-row two">
        <ZoneTile name="P検待ち・直検待ち" cards={z("P検待ち・直検待ち")} now={now} />
        <ZoneTile name="鎮静待ち" cards={z("鎮静待ち")} now={now} />
      </div>

      <section className="dsp-zone dsp-pending">
        <div className="dsp-zone-head">
          <span>到着待ち（本日の予定）</span>
          <span className="cnt">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="dsp-empty">全頭 到着</div>
        ) : (
          <div className="dsp-cards">
            {pending.map((r) => (
              <div key={r.id} className={`dsp-card ${cardClass(r.note)}`}>
                <Badge code={r.sireCode} />
                <div className="dsp-card-body">
                  <div className="dsp-card-name">{r.mareName}</div>
                  <div className="dsp-card-sub">
                    {r.farm && <span>{r.farm}</span>}
                    {r.kind && <span className="mare-kind">{r.kind}</span>}
                    <NoteTags note={r.note} />
                  </div>
                </div>
                {r.apptTime && <div className="dsp-card-time appt">{r.apptTime}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dsp-zone dsp-home">
        <div className="dsp-zone-head">
          <span>帰宅</span>
          <span className="cnt">{z("帰宅").length}</span>
        </div>
        {z("帰宅").length === 0 ? (
          <div className="dsp-empty">—</div>
        ) : (
          <div className="dsp-cards">
            {z("帰宅").map((c) => (
              <div key={c.key} className={`dsp-card ${cardClass(c.note)}`}>
                <Badge code={c.sireCode} />
                <div className="dsp-card-body">
                  <div className="dsp-card-name">{c.mareName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="dsp-foot">
        <Link href="/board">操作ページへ</Link>
      </div>
    </div>
  );
}
