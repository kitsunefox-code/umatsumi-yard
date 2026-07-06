"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Mare,
  Zone,
  MareTag,
  ZONES,
  MARE_TAGS,
  sireColor,
  newMare,
  sampleMares,
} from "@/lib/board";
import { cloudEnabled, subscribeBoard, saveBoard } from "@/lib/cloud";
import Modal from "@/components/Modal";

const STORAGE = "mare-board-data";
const ACCESS_KEY_STORAGE = "mare-transport-access-key";

// 施設マップ配置（実際の場所の並び／処理の流れ順）
const PLACES: { zone: Zone; area: string; accent: string }[] = [
  { zone: "馬積場", area: "umatsumi", accent: "entry" },
  { zone: "洗い場", area: "arai", accent: "wash" },
  { zone: "待機", area: "taiki", accent: "wait" },
  { zone: "第1種付場", area: "tane1", accent: "mate" },
  { zone: "第2種付所", area: "tane2", accent: "mate" },
  { zone: "保留・処置", area: "horyu", accent: "hold" },
  { zone: "帰宅", area: "kitaku", accent: "home" },
];

function load(): Mare[] {
  if (typeof window === "undefined") return sampleMares;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return sampleMares;
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as Mare[]) : sampleMares;
  } catch {
    return sampleMares;
  }
}

export default function BoardPage() {
  const [mares, setMares] = useState<Mare[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // 同期
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [connected, setConnected] = useState(false);
  const maresRef = useRef<Mare[]>([]);
  const skipWrite = useRef(false);

  useEffect(() => {
    setMares(load());
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
  }, [mares]);

  // 保存（localStorage＋同期）
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE, JSON.stringify(mares));
    } catch {
      /* ignore */
    }
    if (cloudEnabled && accessKey) {
      if (skipWrite.current) skipWrite.current = false;
      else saveBoard(accessKey, mares).catch(() => {});
    }
  }, [mares, ready, accessKey]);

  // 購読
  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    subscribeBoard(accessKey, (remote) => {
      if (remote == null) saveBoard(accessKey, maresRef.current).catch(() => {});
      else {
        skipWrite.current = true;
        setMares(remote);
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
  function moveMare(id: string, zone: Zone) {
    updateMare(id, { zone });
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
    setMares((prev) => prev.filter((m) => m.id !== id));
    setOpenId(null);
  }
  function addMare(m: Mare) {
    setMares((prev) => [...prev, m]);
    setAdding(false);
  }

  const byZone = useMemo(() => {
    const map = new Map<Zone, Mare[]>();
    ZONES.forEach((z) => map.set(z, []));
    mares.forEach((m) => map.get(m.zone)?.push(m));
    return map;
  }, [mares]);

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
        {cloudEnabled && (
          <span className={`sync-chip ${connected ? "on" : ""}`}>
            {connected ? `🔄 同期中${accessKey ? `：${accessKey}` : ""}` : "⚪ 未接続"}
          </span>
        )}
      </div>

      <div className="map-flow">
        <span>🚚 馬積場</span>
        <b>→</b>
        <span>洗い場</span>
        <b>→</b>
        <span>待機</span>
        <b>→</b>
        <span>種付場</span>
        <b>→</b>
        <span>（保留・処置）</span>
        <b>→</b>
        <span>🏠 帰宅</span>
      </div>

      <div className="board-map">
        {PLACES.map((p) => {
          const list = byZone.get(p.zone) ?? [];
          return (
            <section
              key={p.zone}
              className={`map-place place-${p.accent}`}
              style={{ gridArea: p.area }}
            >
              <header className="map-place-head">
                <span className="map-place-name">{p.zone}</span>
                <span className="map-place-count">{list.length}</span>
              </header>
              <div className="map-place-body">
                {list.length === 0 && <div className="map-empty">空き</div>}
                {list.map((m) => (
                  <button
                    key={m.id}
                    className="mare-chip"
                    onClick={() => setOpenId(m.id)}
                  >
                    <span
                      className="chip-sire"
                      style={{ background: sireColor(m.sireCode) }}
                    >
                      {m.sireCode || "?"}
                    </span>
                    <span className="chip-body">
                      <span className="chip-name">
                        {m.mareName || "（名前未入力）"}
                      </span>
                      <span className="chip-sub">
                        {m.farm && <span>{m.farm}</span>}
                        {m.apptTime && (
                          <span className="mare-time">🕐{m.apptTime}</span>
                        )}
                        {m.kind && <span className="mare-kind">{m.kind}</span>}
                      </span>
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
                ))}
              </div>
            </section>
          );
        })}
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
