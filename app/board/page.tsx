"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Mare,
  Zone,
  MareTag,
  RosterEntry,
  ZONES,
  MARE_TAGS,
  sireColor,
  newMare,
  normCode,
  zoneMoves,
  Move,
  noteKind,
  cardClass,
  firstFreeFrame,
  resolveMareName,
  resolveNote,
  stayMinutes,
  STAY_WARN_MIN,
  GroupKey,
  ROSTER_GROUPS,
  groupRoster,
  sampleMares,
  roster8Sample,
} from "@/lib/board";
import { Vehicle, effBatch } from "@/lib/types";
import {
  cloudEnabled,
  subscribeBoard,
  saveBoard,
  subscribeYard,
} from "@/lib/cloud";
import { genId } from "@/lib/storage";
import Modal from "@/components/Modal";

// 馬積場の1頭ぶんの表示データ（馬積みアプリ or ボード由来）
type YardOcc = {
  key: string;
  sireCode: string;
  mareName: string;
  foal?: string;
  note?: string;
  batch?: number; // 同時に降ろせる頭数（馬積みアプリ由来）
  arrivedTs?: number; // 到着時刻（滞在時間の起点。ms）
  isNew?: boolean;
  onAdvanceTo: (zone: Zone) => void; // 洗い場 or 待機馬房 へ
  onOpen?: () => void;
};

const STORAGE = "mare-board-data";
const ROSTER_STORAGE = "mare-roster-data";
const GROUP_STORAGE = "mare-board-group";
const ACCESS_KEY_STORAGE = "mare-transport-access-key";

// 施設マップの各場所（配置図どおり）
const PLACE_META: Record<Zone, { icon: string; tone: string }> = {
  "馬積場": { icon: "🐴", tone: "yard" },
  "予備（馬積）": { icon: "🐴", tone: "spare" },
  "洗い場": { icon: "💧", tone: "wash" },
  "待機馬房": { icon: "🛖", tone: "stall" },
  "待機": { icon: "👥", tone: "wait" },
  "第一種付所": { icon: "🏚️", tone: "mate" },
  "第二種付所": { icon: "🏚️", tone: "mate" },
  "P検待ち・直検待ち": { icon: "📋", tone: "check" },
  "鎮静待ち": { icon: "🐎", tone: "sedate" },
  "帰宅": { icon: "🏠", tone: "home" },
};

function loadArr<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export default function BoardPage() {
  const [mares, setMares] = useState<Mare[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [group, setGroup] = useState<GroupKey>("朝"); // 朝/昼/夕
  const [vehicles, setVehicles] = useState<Vehicle[]>([]); // 馬積みアプリ連携
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingRoster, setAddingRoster] = useState(false);
  const [now, setNow] = useState(0); // 滞在時間の現在時刻（tickで更新）

  // 滞在時間の警告用に定期更新
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // 同期
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [connected, setConnected] = useState(false);
  const maresRef = useRef<Mare[]>([]);
  const rosterRef = useRef<RosterEntry[]>([]);
  const groupRef = useRef<GroupKey>("朝");
  const skipWrite = useRef(false);

  useEffect(() => {
    setMares(loadArr<Mare>(STORAGE, sampleMares));
    setRoster(loadArr<RosterEntry>(ROSTER_STORAGE, roster8Sample));
    try {
      const g = window.localStorage.getItem(GROUP_STORAGE) as GroupKey | null;
      if (g) setGroup(g);
    } catch {
      /* ignore */
    }
    if (cloudEnabled) {
      try {
        setAccessKey(window.localStorage.getItem(ACCESS_KEY_STORAGE));
      } catch {
        /* ignore */
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    maresRef.current = mares;
    rosterRef.current = roster;
    groupRef.current = group;
  }, [mares, roster, group]);

  // 保存（localStorage＋同期）
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE, JSON.stringify(mares));
      window.localStorage.setItem(ROSTER_STORAGE, JSON.stringify(roster));
      window.localStorage.setItem(GROUP_STORAGE, group);
    } catch {
      /* ignore */
    }
    if (cloudEnabled && accessKey) {
      if (skipWrite.current) skipWrite.current = false;
      else saveBoard(accessKey, mares, roster, group).catch(() => {});
    }
  }, [mares, roster, group, ready, accessKey]);

  // 購読
  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    subscribeBoard(accessKey, (remote) => {
      if (remote == null)
        saveBoard(
          accessKey,
          maresRef.current,
          rosterRef.current,
          groupRef.current
        ).catch(() => {});
      else {
        skipWrite.current = true;
        setMares(remote.mares);
        setRoster(remote.roster);
        if (remote.group) setGroup(remote.group);
      }
      setConnected(true);
    })
      .then((u) => {
        if (cancelled) u();
        else unsub = u;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (unsub) unsub();
      setConnected(false);
    };
  }, [accessKey]);

  // 馬積みアプリ（yards）を購読＝馬積場に反映（読み取り専用）
  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    subscribeYard(accessKey, (v) => setVehicles(v ?? []))
      .then((u) => {
        if (cancelled) u();
        else unsub = u;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [accessKey]);

  // 馬積みアプリで「下ろした」馬を自動で洗い場へ
  useEffect(() => {
    if (!ready) return;
    const have = new Set(
      maresRef.current.map((m) => m.parkingRef).filter(Boolean)
    );
    const add: Mare[] = [];
    vehicles.forEach((v) => {
      if (v.wentHome || v.parkingNo == null) return;
      v.horses.forEach((h) => {
        if (h.unloadStatus !== "unloaded") return;
        const ref = `${v.id}:${h.id}`;
        if (have.has(ref)) return;
        have.add(ref);
        add.push(
          newMare({
            mareName:
              resolveMareName(roster, h.horseCode) ||
              h.horseName ||
              h.horseCode,
            sireCode: h.horseCode,
            zone: h.unloadTo === "待機馬房" ? "待機馬房" : "洗い場",
            parkingRef: ref,
            note: resolveNote(roster, h.horseCode),
            enteredTs: v.arrivedTs ?? Date.now(),
          })
        );
      });
    });
    if (add.length) setMares((prev) => [...prev, ...add]);
  }, [vehicles, roster, ready]);

  function submitKey() {
    const k = keyInput.trim();
    if (!k) return;
    try {
      window.localStorage.setItem(ACCESS_KEY_STORAGE, k);
    } catch {
      /* ignore */
    }
    setAccessKey(k);
    setKeyInput("");
  }

  // 操作
  function updateMare(id: string, patch: Partial<Mare>) {
    setMares((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  // 場所変更に伴う付随情報（種付所の記録・帰宅時刻）
  function zoneExtra(m: Mare, zone: Zone): Partial<Mare> {
    const p: Partial<Mare> = {};
    if (zone === "第一種付所" || zone === "第二種付所") p.matedAt = zone;
    if (zone === "帰宅") p.departedTs = m.departedTs ?? Date.now();
    return p;
  }
  function moveMare(id: string, zone: Zone) {
    setMares((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        let frameNo = m.frameNo;
        if (zone !== "馬積場") frameNo = undefined;
        else if (!frameNo)
          frameNo = firstFreeFrame(prev.filter((x) => x.id !== m.id));
        return { ...m, zone, frameNo, ...zoneExtra(m, zone) };
      })
    );
  }
  // ワンタップ操作（移動 or 処置タグ付与）
  function advanceMare(id: string, mv: Move) {
    setMares((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const zone = mv.to ?? m.zone; // to が無ければ移動せずタグのみ
        // 種付所へ移動＝新たな種付なのでタグをリセット
        let treats =
          mv.to === "第一種付所" || mv.to === "第二種付所"
            ? []
            : m.treats ?? [];
        if (mv.treat && !treats.includes(mv.treat))
          treats = [...treats, mv.treat];
        return {
          ...m,
          zone,
          frameNo: zone === "馬積場" ? m.frameNo : undefined,
          treats,
          ...zoneExtra(m, zone),
        };
      })
    );
  }
  function toggleTag(id: string, tag: MareTag) {
    setMares((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              tags: m.tags.includes(tag)
                ? m.tags.filter((t) => t !== tag)
                : [...m.tags, tag],
            }
          : m
      )
    );
  }
  function deleteMare(id: string) {
    setMares((prev) => prev.filter((x) => x.id !== id));
    setOpenId(null);
  }
  function addMare(m: Mare) {
    setMares((prev) => [...prev, { ...m, enteredTs: m.enteredTs ?? Date.now() }]);
    setAdding(false);
  }

  // 馬積場（馬積みアプリ）の1頭を洗い場 or 待機馬房 へ進める＝種付けの流れに入れる
  function advanceYardOcc(
    ref: string,
    mareName: string,
    sireCode: string,
    arrivedTs?: number,
    toZone: Zone = "洗い場"
  ) {
    setMares((prev) => [
      ...prev,
      newMare({
        mareName,
        sireCode,
        zone: toZone,
        parkingRef: ref,
        note: resolveNote(roster, sireCode),
        enteredTs: arrivedTs ?? Date.now(),
      }),
    ]);
  }
  // 予定を追加（進行中の追加＝NEW）
  function addRosterEntry(e: RosterEntry) {
    setRoster((prev) => [...prev, { ...e, isNew: true }]);
    setAddingRoster(false);
  }
  // 順番表を（再）取り込み：今の組で未登録の予定だけNEWで追加
  function importRoster() {
    setRoster((prev) => {
      const have = new Set(
        prev.map((r) => normCode(r.sireCode) + "|" + r.mareName)
      );
      const add = groupRoster(group)
        .filter((r) => !have.has(normCode(r.sireCode) + "|" + r.mareName))
        .map((r) => ({ ...r, arrived: false, isNew: true }));
      return [...prev, ...add];
    });
  }
  // 朝/昼/夕を切り替え：その組の予定を読み込む（置き換え）
  function switchGroup(g: GroupKey) {
    if (g === group) return;
    setGroup(g);
    setRoster(groupRoster(g).map((r) => ({ ...r })));
  }
  // 所在ボードをクリア（流れの馬を空に。予定は残す）
  function clearBoard() {
    if (
      confirm(
        "所在ボードの馬（流れ）をすべてクリアしますか？\n（本日の予定リストは残ります）"
      )
    )
      setMares([]);
  }

  const byZone = useMemo(() => {
    const map = new Map<Zone, Mare[]>();
    ZONES.forEach((z) => map.set(z, []));
    mares.forEach((m) => map.get(m.zone)?.push(m));
    return map;
  }, [mares]);

  // 既に種付けの流れに入った馬積みの馬（二重表示しない）
  const advancedRefs = useMemo(
    () => new Set(mares.map((m) => m.parkingRef).filter(Boolean)),
    [mares]
  );

  // 馬積場の枠番号→そこにいる馬（馬積みアプリ由来＋手動でボードに置いた馬）
  const occByFrame = useMemo(() => {
    const map = new Map<number, YardOcc[]>();
    const push = (n: number, o: YardOcc) => {
      const arr = map.get(n) ?? [];
      arr.push(o);
      map.set(n, arr);
    };
    // 馬積みアプリの駐車枠から
    vehicles.forEach((v) => {
      if (v.wentHome || v.parkingNo == null) return;
      const batch = effBatch(v);
      v.horses.forEach((h) => {
        if (h.unloadStatus === "unloaded") return; // 下ろした馬は洗い場へ（自動移動）
        const ref = `${v.id}:${h.id}`;
        if (advancedRefs.has(ref)) return;
        const mareName =
          resolveMareName(roster, h.horseCode) ||
          h.horseName ||
          h.horseCode;
        push(v.parkingNo as number, {
          key: ref,
          sireCode: h.horseCode,
          mareName,
          note: resolveNote(roster, h.horseCode) || undefined,
          batch,
          arrivedTs: v.arrivedTs,
          foal:
            h.foalBirthDate || h.foalSex
              ? `${h.foalBirthDate ?? ""}${h.foalSex ? " " + h.foalSex : ""}`
              : undefined,
          onAdvanceTo: (zone) =>
            advanceYardOcc(ref, mareName, h.horseCode, v.arrivedTs, zone),
        });
      });
    });
    // 手動でボードの馬積場に置いた馬（あれば）
    mares.forEach((m) => {
      if (m.zone === "馬積場" && m.frameNo)
        push(m.frameNo, {
          key: m.id,
          sireCode: m.sireCode,
          mareName: m.mareName || "（名前未入力）",
          note: m.note,
          isNew: m.isNew,
          onAdvanceTo: (zone) => advanceMare(m.id, { label: zone, to: zone }),
          onOpen: () => setOpenId(m.id),
        });
    });
    return map;
  }, [vehicles, advancedRefs, roster, mares]);

  const yardCount = useMemo(
    () => Array.from(occByFrame.values()).reduce((a, l) => a + l.length, 0),
    [occByFrame]
  );

  // 予定の来場状況（馬積場 or ボードに同じ父コードがいれば来場済）
  const presentCodes = useMemo(() => {
    const s = new Set<string>();
    occByFrame.forEach((l) => l.forEach((o) => s.add(normCode(o.sireCode))));
    mares.forEach((m) => s.add(normCode(m.sireCode)));
    return s;
  }, [occByFrame, mares]);

  // 未着の予定だけ（到着したら予定から消す）
  const pendingRoster = useMemo(
    () => roster.filter((r) => !presentCodes.has(normCode(r.sireCode))),
    [roster, presentCodes]
  );

  const open = mares.find((m) => m.id === openId) ?? null;

  if (!ready) return null;

  return (
    <div className="app board-app">
      <div className="topbar">
        <h1>
          📍 種付 所在ボード
          <span className="sub">今どの馬がどこにいるか</span>
        </h1>
        <Link href="/" className="btn btn-ghost">
          🚚 馬積みへ
        </Link>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          ＋ 馬を追加
        </button>
        <button className="btn btn-danger" onClick={clearBoard}>
          クリア
        </button>
        {cloudEnabled && (
          <span className={`sync-chip ${connected ? "on" : ""}`}>
            {connected ? `🔄 同期中${accessKey ? `：${accessKey}` : ""}` : "⚪ 未接続"}
          </span>
        )}
      </div>

      {/* ===== 本日の予定（順番表・朝/昼/夕）＝参照リスト ===== */}
      <section className="roster-panel">
        <div className="roster-head">
          <span className="roster-title">
            📋 本日の予定
            <span className="group-tabs">
              {ROSTER_GROUPS.map((g) => (
                <button
                  key={g.key}
                  className={`group-tab ${group === g.key ? "on" : ""}`}
                  onClick={() => switchGroup(g.key)}
                >
                  {g.key}
                  <span className="group-time">{g.time}</span>
                </button>
              ))}
            </span>
            <span className="roster-count">
              到着待ち {pendingRoster.length}／{roster.length}
            </span>
          </span>
          <div className="roster-actions">
            <button className="btn btn-ghost btn-sm" onClick={importRoster}>
              ⟳ この組を取り込む
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAddingRoster(true)}
            >
              ＋ 予定を追加
            </button>
          </div>
        </div>
        <p className="roster-hint">
          馬積みアプリでスタッフが枠に馬を置くと、下の「馬積場」に出て、この予定からは消えます（到着待ちだけ表示）。
        </p>
        {pendingRoster.length === 0 ? (
          <div className="roster-empty">
            {roster.length === 0 ? "予定がありません" : "全頭 到着しました 🎉"}
          </div>
        ) : (
          <div className="roster-chips">
            {pendingRoster.map((r) => (
              <div key={r.id} className={`roster-chip ${cardClass(r.note)}`}>
                {r.isNew && <span className="badge-new">NEW</span>}
                <span
                  className="chip-sire"
                  style={{ background: sireColor(r.sireCode) }}
                >
                  {r.sireCode || "?"}
                </span>
                <span className="chip-body">
                  <span className="chip-name">{r.mareName}</span>
                  <span className="chip-sub">
                    {r.farm && <span>{r.farm}</span>}
                    {r.apptTime && <span className="mare-time">🕐{r.apptTime}</span>}
                    {r.kind && <span className="mare-kind">{r.kind}</span>}
                  </span>
                  <NoteBadge note={r.note} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="fmap">
        {/* 馬積場（馬積みアプリ連携。駐車枠 1〜15） */}
        <section className="fyard">
          <div className="fyard-label">
            <span className="fplace-icon">🐴</span>
            <span className="fplace-name">馬積場</span>
            <span className="fplace-count">{yardCount}</span>
            <span className="fyard-note">馬積みアプリと連携</span>
          </div>
          <div className="fyard-diagram">
            <div className="fyard-left">
              {[3, 2, 1].map((n) => (
                <FrameCell key={n} n={n} occs={occByFrame.get(n)} now={now} small />
              ))}
            </div>
            <div className="fyard-frames">
              {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                <FrameCell key={n} n={n} occs={occByFrame.get(n)} now={now} />
              ))}
            </div>
          </div>
          {/* 予備（馬積）＝馬積の欄に配置 */}
          <PlaceBox
            zone="予備（馬積）"
            byZone={byZone}
            onOpen={setOpenId}
            onAdvance={advanceMare}
            now={now}
            wide
          />
        </section>

        {/* 中段（洗い場に待機馬房を併設） */}
        <div className="fmap-row four">
          <PlaceBox zone="P検待ち・直検待ち" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} />
          <PlaceBox zone="鎮静待ち" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} />
          <PlaceBox zone="洗い場" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} />
          <PlaceBox zone="待機馬房" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} />
        </div>

        {/* 待機（横長） */}
        <PlaceBox zone="待機" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} wide />

        {/* 下段：第二・第一種付所 */}
        <div className="fmap-row two">
          <PlaceBox zone="第二種付所" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} />
          <PlaceBox zone="第一種付所" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} />
        </div>

        {/* 帰宅（横長・出口） */}
        <PlaceBox zone="帰宅" byZone={byZone} onOpen={setOpenId} onAdvance={advanceMare} now={now} wide />
      </div>

      {/* ===== カード操作シート ===== */}
      {open && (
        <Modal
          title={`${open.mareName || "馬"}（父 ${open.sireCode || "?"}）`}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm("この馬を削除しますか？")) deleteMare(open.id);
                }}
              >
                削除
              </button>
              <button
                className="btn btn-primary"
                style={{ marginLeft: "auto" }}
                onClick={() => setOpenId(null)}
              >
                閉じる
              </button>
            </>
          }
        >
          <div className="sheet-label">場所を移動</div>
          <div className="zone-grid">
            {ZONES.map((z) => (
              <button
                key={z}
                className={`zone-btn ${open.zone === z ? "on" : ""}`}
                onClick={() => moveMare(open.id, z)}
              >
                {z}
              </button>
            ))}
          </div>

          <div className="sheet-label">状態タグ（保留・処置）</div>
          <div className="tag-grid">
            {MARE_TAGS.map((t) => (
              <button
                key={t}
                className={`tag-btn ${open.tags.includes(t) ? "on" : ""}`}
                onClick={() => toggleTag(open.id, t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="sheet-label">内容</div>
          <div className="field-row">
            <div className="field">
              <label>牝馬名</label>
              <input
                type="text"
                value={open.mareName}
                onChange={(e) => updateMare(open.id, { mareName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>父コード</label>
              <input
                type="text"
                value={open.sireCode}
                onChange={(e) => updateMare(open.id, { sireCode: e.target.value })}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>牧場</label>
              <input
                type="text"
                value={open.farm ?? ""}
                onChange={(e) => updateMare(open.id, { farm: e.target.value })}
              />
            </div>
            <div className="field">
              <label>予約時間</label>
              <input
                type="text"
                value={open.apptTime ?? ""}
                onChange={(e) => updateMare(open.id, { apptTime: e.target.value })}
                placeholder="例 7:30"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ===== 馬を追加 ===== */}
      {adding && (
        <AddMareForm onSave={addMare} onClose={() => setAdding(false)} />
      )}

      {/* ===== 予定を追加（NEW） ===== */}
      {addingRoster && (
        <AddRosterForm
          onSave={addRosterEntry}
          onClose={() => setAddingRoster(false)}
        />
      )}

      {/* ===== 合言葉 ===== */}
      {cloudEnabled && !accessKey && (
        <Modal
          title="🔄 リアルタイム同期"
          onClose={() => {}}
          footer={
            <button className="btn btn-primary btn-block" onClick={submitKey}>
              この合言葉で同期を始める
            </button>
          }
        >
          <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
            みんなで同じボードを共有するための<strong>合言葉</strong>を入力してください。
            <br />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              馬積みアプリと同じ合言葉を使うと、両方が同じチームで同期されます。
            </span>
          </p>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitKey();
            }}
            placeholder="例: shadai-yard-2026"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function WarnIcon() {
  return (
    <svg className="warn-icon" viewBox="0 0 24 22" aria-hidden="true">
      <path
        d="M12 1.6 L22.4 20.4 L1.6 20.4 Z"
        fill="#F5C518"
        stroke="#111"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect x="10.7" y="7" width="2.6" height="7.2" rx="1.3" fill="#111" />
      <circle cx="12" cy="17.1" r="1.5" fill="#111" />
    </svg>
  );
}

function fmtTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function HomeInfo({ m }: { m: Mare }) {
  if (m.zone !== "帰宅") return null;
  const stay =
    m.enteredTs && m.departedTs
      ? Math.floor((m.departedTs - m.enteredTs) / 60000)
      : null;
  return (
    <span className="home-info">
      {m.matedAt && <span className="hi-mate">種付：{m.matedAt}</span>}
      {stay != null && <span className="hi-stay">滞在 計{stay}分</span>}
      {m.departedTs && (
        <span className="hi-home">帰宅 {fmtTime(m.departedTs)}</span>
      )}
    </span>
  );
}

function StayWarn({ ts, now }: { ts?: number; now: number }) {
  const m = stayMinutes(ts, now);
  if (m == null || m < STAY_WARN_MIN) return null;
  return <span className="stay-warn">⚠ 滞在{m}分</span>;
}

function NoteBadge({ note, frame }: { note?: string; frame?: boolean }) {
  if (!note) return null;
  const k = noteKind(note);
  return (
    <span className={`${frame ? "frame-note" : "mare-note"} note-${k}`}>
      {k === "sedate" && frame && <WarnIcon />}
      {note}
    </span>
  );
}

function MareList({
  list,
  onOpen,
  onAdvance,
  now,
}: {
  list: Mare[];
  onOpen: (id: string) => void;
  onAdvance?: (id: string, mv: Move) => void;
  now: number;
}) {
  if (!list.length) return null;
  return (
    <div className="fplace-body">
      {list.map((m) => {
        const moves = zoneMoves(m.zone);
        const branching = !!onAdvance && moves.length > 1;
        const over =
          (stayMinutes(m.enteredTs, now) ?? 0) >= STAY_WARN_MIN;
        return (
          <div
            key={m.id}
            className={`mare-chip${branching ? " branching" : ""} ${cardClass(
              m.note
            )}${over ? " overdue" : ""}`}
          >
            {m.isNew && <span className="badge-new">NEW</span>}
            <button className="chip-open" onClick={() => onOpen(m.id)}>
              <span
                className="chip-sire"
                style={{ background: sireColor(m.sireCode) }}
              >
                {m.sireCode || "?"}
              </span>
              <span className="chip-body">
                <span className="chip-name">{m.mareName || "（名前未入力）"}</span>
                <span className="chip-sub">
                  {m.farm && <span>{m.farm}</span>}
                  {m.apptTime && <span className="mare-time">🕐{m.apptTime}</span>}
                  {m.kind && <span className="mare-kind">{m.kind}</span>}
                </span>
                <NoteBadge note={m.note} />
                {m.treats && m.treats.length > 0 && (
                  <span className="treat-list">
                    {m.treats.map((t) => (
                      <span key={t} className="treat-badge">
                        🩺{t}
                      </span>
                    ))}
                  </span>
                )}
                {m.zone !== "帰宅" && <StayWarn ts={m.enteredTs} now={now} />}
                <HomeInfo m={m} />
                {m.tags.length > 0 && (
                  <span className="chip-tags">
                    {m.tags.map((t) => (
                      <span key={t} className="mare-tag">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
            {onAdvance && moves.length > 0 && (
              <span className={`chip-advs${moves.length > 1 ? " branch" : ""}`}>
                {moves.map((mv) => (
                  <button
                    key={mv.label}
                    className={`chip-adv${mv.treat ? " treat" : ""}`}
                    onClick={() => onAdvance(m.id, mv)}
                    title={`${mv.label}`}
                  >
                    <span className="chip-adv-arrow">▶</span>
                    <span className="chip-adv-label">{mv.label}</span>
                  </button>
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FrameCell({
  n,
  occs,
  now,
  small,
}: {
  n: number;
  occs?: YardOcc[];
  now: number;
  small?: boolean;
}) {
  if (!occs || occs.length === 0) {
    return <div className={`fyard-frame${small ? " small" : ""}`}>{n}</div>;
  }
  const batch = occs[0]?.batch ?? 1;
  return (
    <div className={`fyard-frame occ${small ? " small" : ""}`}>
      <span className="frame-head">
        <span className="frame-no">{n}</span>
        {batch >= 2 && <span className="frame-batch">{batch}頭同時</span>}
      </span>
      {occs.map((o) => {
        const over = (stayMinutes(o.arrivedTs, now) ?? 0) >= STAY_WARN_MIN;
        return (
        <div
          key={o.key}
          className={`frame-occ ${cardClass(o.note)}${over ? " overdue" : ""}`}
        >
          {o.isNew && <span className="badge-new">NEW</span>}
          <button
            className="frame-mare"
            onClick={() => (o.onOpen ? o.onOpen() : o.onAdvanceTo("洗い場"))}
          >
            <span
              className="frame-sire"
              style={{ background: sireColor(o.sireCode) }}
            >
              {o.sireCode || "?"}
            </span>
            <span className="frame-name">{o.mareName}</span>
            <NoteBadge note={o.note} frame />
            <StayWarn ts={o.arrivedTs} now={now} />
            {o.foal && <span className="frame-foal">{o.foal}</span>}
          </button>
          <button
            className="frame-adv"
            onClick={() => o.onAdvanceTo("洗い場")}
            title="洗い場へ進める"
          >
            ▶洗い場
          </button>
          <button
            className="frame-adv"
            onClick={() => o.onAdvanceTo("待機馬房")}
            title="待機馬房へ進める"
          >
            ▶待機馬房
          </button>
        </div>
        );
      })}
    </div>
  );
}

function AddRosterForm({
  onSave,
  onClose,
}: {
  onSave: (e: RosterEntry) => void;
  onClose: () => void;
}) {
  const [mareName, setMareName] = useState("");
  const [sireCode, setSireCode] = useState("");
  const [farm, setFarm] = useState("");
  const [apptTime, setApptTime] = useState("");
  const [kind, setKind] = useState<"新" | "再" | "">("新");

  return (
    <Modal
      title="予定を追加（順番表）"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary btn-block"
          disabled={!mareName.trim() || !sireCode.trim()}
          onClick={() =>
            onSave({
              id: genId("r"),
              mareName: mareName.trim(),
              sireCode: sireCode.trim(),
              farm: farm.trim(),
              apptTime: apptTime.trim(),
              kind,
              arrived: false,
              isNew: true,
            })
          }
        >
          予定に追加（NEW）
        </button>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>牝馬名</label>
          <input
            type="text"
            value={mareName}
            onChange={(e) => setMareName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>父（種牡馬）コード</label>
          <input
            type="text"
            value={sireCode}
            onChange={(e) => setSireCode(e.target.value)}
            placeholder="例 ＫＢＬ"
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>牧場</label>
          <input
            type="text"
            value={farm}
            onChange={(e) => setFarm(e.target.value)}
          />
        </div>
        <div className="field">
          <label>予定時間</label>
          <input
            type="text"
            value={apptTime}
            onChange={(e) => setApptTime(e.target.value)}
            placeholder="例 8:30"
          />
        </div>
      </div>
      <div className="field">
        <label>新 / 再</label>
        <div className="seg" style={{ width: "100%" }}>
          <button
            type="button"
            style={{ flex: 1 }}
            className={kind === "新" ? "active-male" : ""}
            onClick={() => setKind("新")}
          >
            新
          </button>
          <button
            type="button"
            style={{ flex: 1 }}
            className={kind === "再" ? "active-female" : ""}
            onClick={() => setKind("再")}
          >
            再
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PlaceBox({
  zone,
  byZone,
  onOpen,
  onAdvance,
  now,
  wide,
}: {
  zone: Zone;
  byZone: Map<Zone, Mare[]>;
  onOpen: (id: string) => void;
  onAdvance: (id: string, mv: Move) => void;
  now: number;
  wide?: boolean;
}) {
  const list = byZone.get(zone) ?? [];
  const meta = PLACE_META[zone];
  return (
    <section
      className={`fplace tone-${meta.tone}${wide ? " wide" : ""}${
        list.length ? " has-mares" : ""
      }`}
    >
      <div className="fplace-head">
        <span className="fplace-icon">{meta.icon}</span>
        <span className="fplace-name">{zone}</span>
        {list.length > 0 && <span className="fplace-count">{list.length}</span>}
      </div>
      <MareList list={list} onOpen={onOpen} onAdvance={onAdvance} now={now} />
    </section>
  );
}

function AddMareForm({
  onSave,
  onClose,
}: {
  onSave: (m: Mare) => void;
  onClose: () => void;
}) {
  const [mareName, setMareName] = useState("");
  const [sireCode, setSireCode] = useState("");
  const [farm, setFarm] = useState("");
  const [apptTime, setApptTime] = useState("");
  const [kind, setKind] = useState<"新" | "再" | "">("");
  const [zone, setZone] = useState<Zone>("馬積場");

  return (
    <Modal
      title="馬を追加"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary btn-block"
          onClick={() =>
            onSave(
              newMare({
                mareName: mareName.trim(),
                sireCode: sireCode.trim(),
                farm: farm.trim(),
                apptTime: apptTime.trim(),
                kind,
                zone,
                arrivedAt: undefined,
              })
            )
          }
        >
          追加する
        </button>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>牝馬名</label>
          <input
            type="text"
            value={mareName}
            onChange={(e) => setMareName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>父（種牡馬）コード</label>
          <input
            type="text"
            value={sireCode}
            onChange={(e) => setSireCode(e.target.value)}
            placeholder="例 ＫＢＬ"
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>牧場</label>
          <input
            type="text"
            value={farm}
            onChange={(e) => setFarm(e.target.value)}
          />
        </div>
        <div className="field">
          <label>予約時間</label>
          <input
            type="text"
            value={apptTime}
            onChange={(e) => setApptTime(e.target.value)}
            placeholder="例 7:30"
          />
        </div>
      </div>
      <div className="field">
        <label>新 / 再</label>
        <div className="seg" style={{ width: "100%" }}>
          <button
            type="button"
            style={{ flex: 1 }}
            className={kind === "新" ? "active-male" : ""}
            onClick={() => setKind("新")}
          >
            新
          </button>
          <button
            type="button"
            style={{ flex: 1 }}
            className={kind === "再" ? "active-female" : ""}
            onClick={() => setKind("再")}
          >
            再
          </button>
          <button
            type="button"
            style={{ flex: 1 }}
            className={kind === "" ? "active-not" : ""}
            onClick={() => setKind("")}
          >
            —
          </button>
        </div>
      </div>
      <div className="field">
        <label>最初の場所</label>
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value as Zone)}
        >
          {ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
