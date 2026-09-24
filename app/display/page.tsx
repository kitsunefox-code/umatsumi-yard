"use client";

// 見る専用の所在ボード。事務所のホワイトボードに名札を貼った見た目をそのまま画面にしたもの。
// 操作はできない。所在ボードと馬積みアプリの同期データを映すだけ。
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Mare,
  RosterEntry,
  Zone,
  GroupKey,
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
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

type Plate = {
  key: string;
  sireCode: string;
  mareName: string;
  farm?: string;
  note?: string;
  since?: number; // 経過の起点（ms）
  frame?: number; // 馬積場の枠番号
  flags: string[]; // 鎮静待ち以外で残す補足（処置など）
};

function noteWord(note?: string): string {
  if (!note) return "";
  if (note.includes("鎮静")) return "鎮静";
  if (note.includes("再発")) return "上り再発";
  if (note.includes("上り")) return "上り";
  if (note.toUpperCase().includes("OV")) return "OV";
  return "";
}

function fmtDur(min: number): string {
  if (min >= 24 * 60) return "1日以上";
  if (min >= 60) return `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, "0")}分`;
  return `${min}分`;
}

// 名札：左端に勝負服色、牝馬名を大きく。種付所では種牡馬名と入室からの分数を添える
function PlateView({ p, now, room }: { p: Plate; now: number; room?: boolean }) {
  const b = sireBadge(p.sireCode);
  const min = stayMinutes(p.since, now);
  const over = !room && min != null && min >= STAY_WARN_MIN;
  const word = noteWord(p.note);
  return (
    <div className={`pl ${cardClass(p.note)}${room ? " room" : ""}`}>
      <span className="pl-edge" style={{ background: b.background }} />
      <span className="pl-code" style={{ background: b.background, color: b.color }}>
        {normCode(p.sireCode)}
      </span>
      <span className="pl-main">
        <span className="pl-name">
          {p.frame != null && <span className="pl-frame">{p.frame}</span>}
          {p.mareName}
        </span>
        <span className="pl-sub">
          {room && <span className="pl-sire">{stallionName(p.sireCode)}</span>}
          {p.farm && <span>{p.farm}</span>}
          {word && <span className="pl-word">{word}</span>}
          {p.flags.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </span>
      </span>
      {room && min != null && <span className="pl-min">{fmtDur(min)}</span>}
      {over && <span className="pl-min over">{fmtDur(min!)}</span>}
    </div>
  );
}

function Section({
  title,
  plates,
  now,
  children,
}: {
  title: string;
  plates: Plate[];
  now: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="sec">
      <h2 className="sec-title">
        {title}
        <span className="sec-n">{plates.length}</span>
      </h2>
      <div className="sec-body">
        {children}
        {plates.map((p) => (
          <PlateView key={p.key} p={p} now={now} />
        ))}
      </div>
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

  const advancedRefs = useMemo(
    () => new Set(mares.map((m) => m.parkingRef).filter(Boolean)),
    [mares]
  );
  const yard: Plate[] = useMemo(() => {
    const out: Plate[] = [];
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
          frame: v.parkingNo as number,
          flags: batch > 1 ? [`${batch}頭同時`] : [],
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
          note: m.note,
          since: m.enteredTs,
          frame: m.zone === "馬積場" ? m.frameNo : undefined,
          flags: [...(m.zone === "予備（馬積）" ? ["予備"] : []), ...(m.treats ?? []), ...m.tags],
        })
      );
    out.sort((a, b) => (a.frame ?? 99) - (b.frame ?? 99));
    return out;
  }, [vehicles, advancedRefs, roster, mares]);

  const byZone = useMemo(() => {
    const map = new Map<Zone, Plate[]>();
    mares.forEach((m) => {
      if (m.zone === "馬積場" || m.zone === "予備（馬積）") return;
      const inRoom = m.zone === "第一種付所" || m.zone === "第二種付所";
      const p: Plate = {
        key: m.id,
        sireCode: m.sireCode,
        mareName: m.mareName || "（名前未入力）",
        farm: m.farm,
        note: m.note,
        since: inRoom ? m.matedTs ?? m.enteredTs : m.zone === "帰宅" ? undefined : m.enteredTs,
        flags: [...(m.treats ?? []), ...m.tags],
      };
      const arr = map.get(m.zone) ?? [];
      arr.push(p);
      map.set(m.zone, arr);
    });
    map.get("待機")?.sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    return map;
  }, [mares]);
  const z = (name: Zone) => byZone.get(name) ?? [];

  const presentCodes = useMemo(() => {
    const s = new Set<string>();
    yard.forEach((p) => s.add(normCode(p.sireCode)));
    mares.forEach((m) => s.add(normCode(m.sireCode)));
    return s;
  }, [yard, mares]);
  const pending = useMemo(
    () => roster.filter((r) => !presentCodes.has(normCode(r.sireCode))),
    [roster, presentCodes]
  );

  function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(KEY_STORAGE, k);
    setAccessKey(k);
  }

  const d = new Date(now || Date.now());
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
  const clock = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

  if (!accessKey) {
    return (
      <div className="wb">
        <div className="wb-head">
          <span className="wb-title">所在ボード</span>
        </div>
        <div className="wb-key">
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

  const room1 = z("第一種付所");
  const room2 = z("第二種付所");
  const wait = z("待機");

  return (
    <div className="wb">
      <div className="wb-head">
        <span className="wb-title">所在ボード</span>
        <span className="wb-date">
          {dateLabel}
          {group ? `　${group}の組` : ""}
        </span>
        <span className="wb-clock">{clock}</span>
        {!connected && <span className="wb-offline">つながっていません</span>}
      </div>

      <div className="rooms">
        {[
          ["第一種付所", room1],
          ["第二種付所", room2],
        ].map(([name, list]) => (
          <section className="room" key={name as string}>
            <h2 className="room-title">{name as string}</h2>
            {(list as Plate[]).length === 0 ? (
              <div className="room-empty">空き</div>
            ) : (
              (list as Plate[]).map((p) => <PlateView key={p.key} p={p} now={now} room />)
            )}
          </section>
        ))}
      </div>

      <Section title="待機" plates={wait} now={now}>
        {wait.length > 0 && <span className="next-mark">次</span>}
      </Section>
      <Section title="洗い場" plates={z("洗い場")} now={now} />
      <Section title="待機馬房" plates={z("待機馬房")} now={now} />
      <Section title="馬積場" plates={yard} now={now} />
      <Section title="P検待ち・直検待ち" plates={z("P検待ち・直検待ち")} now={now} />
      <Section title="鎮静待ち" plates={z("鎮静待ち")} now={now} />

      <section className="sec list">
        <h2 className="sec-title">
          到着待ち<span className="sec-n">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <div className="sec-none">全頭到着</div>
        ) : (
          <ul className="names">
            {pending.map((r) => (
              <li key={r.id} className={cardClass(r.note)}>
                <span className="names-code" style={{ background: sireBadge(r.sireCode).background, color: sireBadge(r.sireCode).color }}>
                  {normCode(r.sireCode)}
                </span>
                <span className="names-name">{r.mareName}</span>
                {noteWord(r.note) && <span className="pl-word">{noteWord(r.note)}</span>}
                {r.apptTime && <span className="names-time">{r.apptTime}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sec list">
        <h2 className="sec-title">
          帰宅<span className="sec-n">{z("帰宅").length}</span>
        </h2>
        {z("帰宅").length === 0 ? (
          <div className="sec-none">—</div>
        ) : (
          <ul className="names home">
            {z("帰宅").map((p) => (
              <li key={p.key}>
                <span className="names-code" style={{ background: sireBadge(p.sireCode).background, color: sireBadge(p.sireCode).color }}>
                  {normCode(p.sireCode)}
                </span>
                <span className="names-name">{p.mareName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="wb-foot">
        <Link href="/board">操作ページ</Link>
      </div>
    </div>
  );
}
