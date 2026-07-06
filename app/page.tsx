"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Vehicle, Horse, UnloadStatus, effBatch, wakuClass } from "@/lib/types";
import { loadData, saveData, genId } from "@/lib/storage";
import { cloudEnabled, subscribeYard, saveYard } from "@/lib/cloud";
import { initialVehicles, initialHorseCodes } from "@/lib/initialData";
import VehicleCard from "@/components/VehicleCard";
import VehicleModal from "@/components/VehicleModal";
import VehicleForm from "@/components/VehicleForm";
import Modal from "@/components/Modal";
import StagingBar, { StagedHorse } from "@/components/StagingBar";
import FoalControls from "@/components/FoalControls";

export default function Page() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ready, setReady] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null); // 詳細モーダル
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // リアルタイム同期（合言葉ごとに全端末で共有）
  const ACCESS_KEY_STORAGE = "mare-transport-access-key";
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [cloudConnected, setCloudConnected] = useState(false);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const skipCloudWrite = useRef(false);

  // 配置する馬（複数選択・最大3頭）
  const [staging, setStaging] = useState<StagedHorse[]>([]);
  const MAX_HORSES = 3;
  // 誕生日クイック編集
  const [editingFoal, setEditingFoal] = useState<{
    vehicleId: string;
    horseId: string;
  } | null>(null);

  // 初回ロード
  useEffect(() => {
    setVehicles(loadData());
    if (cloudEnabled) {
      try {
        setAccessKey(window.localStorage.getItem(ACCESS_KEY_STORAGE));
      } catch {
        /* ignore */
      }
    }
    setReady(true);
  }, []);

  // 最新の vehicles を ref に保持（クラウド初期化用）
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // 滞在時間の警告を最新化するため定期的に再描画
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // 変更の都度 localStorage 保存 ＋ 同期中ならクラウドにも保存
  useEffect(() => {
    if (!ready) return;
    saveData(vehicles);
    if (cloudEnabled && accessKey) {
      if (skipCloudWrite.current) {
        skipCloudWrite.current = false; // リモート反映分は書き戻さない（ループ防止）
      } else {
        saveYard(accessKey, vehicles).catch(() => {});
      }
    }
  }, [vehicles, ready, accessKey]);

  // クラウド購読（合言葉の駐車場を全端末で共有）
  useEffect(() => {
    if (!cloudEnabled || !accessKey) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    subscribeYard(accessKey, (remote) => {
      if (remote == null) {
        // クラウドに未作成 → 現在の内容で初期化
        saveYard(accessKey, vehiclesRef.current).catch(() => {});
      } else {
        skipCloudWrite.current = true;
        setVehicles(remote);
      }
      setCloudConnected(true);
    })
      .then((u) => {
        if (cancelled) u();
        else unsub = u;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (unsub) unsub();
      setCloudConnected(false);
    };
  }, [accessKey]);

  function submitAccessKey() {
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

  const openVehicle = useMemo(
    () => vehicles.find((v) => v.id === openId) ?? null,
    [vehicles, openId]
  );

  // 予備スペース（駐車番号なし・帰宅前）
  const reserved = useMemo(
    () => vehicles.filter((v) => v.parkingNo == null && !v.wentHome),
    [vehicles]
  );

  // 帰宅済み（本日の記録）
  const departed = useMemo(
    () => vehicles.filter((v) => v.wentHome),
    [vehicles]
  );

  // 駐車番号 → 車両 の対応（帰宅済みは枠を解放して除外）
  const byNo = useMemo(() => {
    const m = new Map<number, Vehicle>();
    vehicles.forEach((v) => {
      if (v.parkingNo != null && !v.wentHome && !m.has(v.parkingNo))
        m.set(v.parkingNo, v);
    });
    return m;
  }, [vehicles]);

  // 左ドック=3,2,1（Excelの上→下）、中央ヤード=4〜15（+それ以外の占有番号）
  const dockNos = [3, 2, 1];
  const floorNos = useMemo(() => {
    const base = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const extra = [...byNo.keys()]
      .filter((n) => !dockNos.includes(n) && !base.includes(n))
      .sort((a, b) => a - b);
    return [...base, ...extra];
  }, [byNo]);

  // 積載中（未降ろし/降ろし中）の馬コード集合 → 一覧のハイライト用
  const loadedCodes = useMemo(() => {
    const s = new Set<string>();
    vehicles.forEach((v) =>
      v.horses.forEach((h) => {
        if (h.horseCode && h.unloadStatus !== "unloaded")
          s.add(h.horseCode.toUpperCase());
      })
    );
    return s;
  }, [vehicles]);

  // ---- 操作 ----
  function setHorseStatus(
    vehicleId: string,
    horseId: string,
    status: UnloadStatus
  ) {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id !== vehicleId
          ? v
          : {
              ...v,
              horses: v.horses.map((h) =>
                h.id === horseId ? { ...h, unloadStatus: status } : h
              ),
            }
      )
    );
  }

  // 同時降ろし：設定頭数ぶん（未降ろしの先頭から）まとめて降ろす
  function unloadBatchNow(vehicleId: string) {
    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id !== vehicleId) return v;
        let remain = effBatch(v);
        return {
          ...v,
          horses: v.horses.map((h) => {
            if (h.unloadStatus !== "unloaded" && remain > 0) {
              remain--;
              return { ...h, unloadStatus: "unloaded" as UnloadStatus };
            }
            return h;
          }),
        };
      })
    );
  }

  // 帰宅（全馬降ろし後）：帰宅済みにして記録を残す
  function goHome(vehicleId: string) {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === vehicleId
          ? { ...v, wentHome: true, departedAt: now() }
          : v
      )
    );
  }

  function saveVehicle(v: Vehicle) {
    setVehicles((prev) => {
      const exists = prev.some((x) => x.id === v.id);
      return exists ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v];
    });
    setEditing(null);
  }

  function deleteVehicle(id: string) {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    setOpenId(null);
    setEditing(null);
  }

  function doClearAll() {
    setVehicles([]);
    setConfirmClear(false);
    setOpenId(null);
  }

  function restoreSample() {
    setVehicles(initialVehicles.map((v) => ({ ...v })));
    setConfirmClear(false);
  }

  // ---- 配置する馬の選択（複数・最大3頭） ----
  function stageCode(code: string) {
    setStaging((prev) => {
      // 通常コードは再タップで解除（トグル）
      if (code !== "乳馬" && prev.some((h) => h.code === code)) {
        return prev.filter((h) => h.code !== code);
      }
      if (prev.length >= MAX_HORSES) return prev; // 最大3頭
      return [
        ...prev,
        { id: genId("stage"), code, foalBirthDate: "", foalSex: "不明" },
      ];
    });
  }
  function updateStaged(id: string, patch: Partial<StagedHorse>) {
    setStaging((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...patch } : h))
    );
  }
  function removeStaged(id: string) {
    setStaging((prev) => prev.filter((h) => h.id !== id));
  }
  const staging0 = staging.length > 0;

  // 到着/帰宅の記録用（日付＋時刻）例: "7/4 14:05"
  function now(): string {
    const d = new Date();
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${mm}`;
  }

  function makeHorseFrom(s: StagedHorse): Horse {
    const code = s.code.trim();
    return {
      id: genId("horse"),
      horseCode: code,
      horseName: code,
      isBroodmare: true, // 全馬 繁殖牝馬
      foalBirthDate: s.foalBirthDate,
      foalSex: s.foalSex,
      unloadStatus: "not_unloaded",
    };
  }

  // 既存車両に積む（最大3頭まで）
  function placeOnVehicle(vehicleId: string) {
    if (!staging0) return;
    const newHorses = staging.map(makeHorseFrom);
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === vehicleId
          ? { ...v, horses: [...v.horses, ...newHorses].slice(0, MAX_HORSES) }
          : v
      )
    );
    setStaging([]);
  }

  // 空き駐車枠に新しい車を作って一気に配置
  function placeOnSlot(parkingNo: number) {
    if (!staging0) return;
    const horses = staging.map(makeHorseFrom);
    setVehicles((prev) => [
      ...prev,
      {
        id: genId("vehicle"),
        parkingNo,
        vehicleCode: "",
        unloadBatch: horses.length,
        memo: "",
        horses,
        arrivedAt: now(),
        arrivedTs: Date.now(),
      },
    ]);
    setStaging([]);
  }

  // 予備スペースに空きの車を1台追加（「予備を追加」ボタン）
  function addReserveVehicle() {
    setVehicles((prev) => [
      ...prev,
      {
        id: genId("vehicle"),
        parkingNo: null,
        vehicleCode: "",
        unloadBatch: 1,
        memo: "",
        reserve: true,
        horses: [],
        arrivedAt: now(),
        arrivedTs: Date.now(),
      },
    ]);
  }

  // 予備スペースに新しい車を作って一気に配置
  function placeOnReserve() {
    if (!staging0) return;
    const horses = staging.map(makeHorseFrom);
    setVehicles((prev) => [
      ...prev,
      {
        id: genId("vehicle"),
        parkingNo: null,
        vehicleCode: "",
        unloadBatch: horses.length,
        memo: "",
        reserve: true,
        horses,
        arrivedAt: now(),
        arrivedTs: Date.now(),
      },
    ]);
    setStaging([]);
  }

  // 車両クリック時：配置中なら積む、そうでなければ詳細を開く
  function activateVehicle(id: string) {
    if (staging0) placeOnVehicle(id);
    else setOpenId(id);
  }

  // 前後入替（先頭2頭を入替）
  function swapHorses(vehicleId: string) {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === vehicleId && v.horses.length >= 2
          ? { ...v, horses: [v.horses[1], v.horses[0], ...v.horses.slice(2)] }
          : v
      )
    );
  }

  // 同時降ろし頭数を切替（1頭ずつ → 2頭同時 → …頭数 → 1頭ずつ）
  function cycleUnloadBatch(vehicleId: string) {
    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id !== vehicleId) return v;
        const count = v.horses.length;
        const cur = effBatch(v);
        const next = cur <= 1 ? count : cur - 1;
        return { ...v, unloadBatch: next };
      })
    );
  }

  // 誕生日／性別／繁殖のクイック更新
  function updateFoal(
    vehicleId: string,
    horseId: string,
    patch: Partial<Horse>
  ) {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id !== vehicleId
          ? v
          : {
              ...v,
              horses: v.horses.map((h) =>
                h.id === horseId ? { ...h, ...patch } : h
              ),
            }
      )
    );
  }

  const foalTarget = useMemo(() => {
    if (!editingFoal) return null;
    const v = vehicles.find((x) => x.id === editingFoal.vehicleId);
    const h = v?.horses.find((x) => x.id === editingFoal.horseId);
    return v && h ? { v, h } : null;
  }, [editingFoal, vehicles]);

  // 駐車枠の中身（車両カード）
  function vehicleCardEl(v: Vehicle) {
    return (
      <VehicleCard
        vehicle={v}
        staging={staging0}
        onOpen={() => activateVehicle(v.id)}
        onQuickUnload={(horseId) => setHorseStatus(v.id, horseId, "unloaded")}
        onCycleBatch={() => cycleUnloadBatch(v.id)}
        onEditFoal={(horseId) => setEditingFoal({ vehicleId: v.id, horseId })}
        onDropHorse={() => placeOnVehicle(v.id)}
        onSwapHorses={() => swapHorses(v.id)}
        onGoHome={() => goHome(v.id)}
      />
    );
  }

  // 空き駐車枠
  function emptySlot(n: number, tall: boolean) {
    return (
      <div
        className={`ry-empty ${tall ? "tall" : ""} ${
          staging0 ? "staging-target" : ""
        }`}
        onClick={() => staging0 && placeOnSlot(n)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          placeOnSlot(n);
        }}
      >
        <span className={`ry-no ${wakuClass(n)}`}>{n}</span>
        <span className={`ry-add ${staging0 ? "on" : ""}`}>
          {staging0 ? "＋配置" : "空き"}
        </span>
      </div>
    );
  }

  if (!ready) return null;

  return (
    <div className={`app ${staging0 ? "has-staging" : ""}`}>
      <div className="topbar">
        <h1>
          🐴 馬積み駐車場管理アプリ
          <span className="sub">Mare Transport Yard Manager</span>
        </h1>
        <Link href="/board" className="btn btn-ghost">
          📍 所在ボード
        </Link>
        {cloudEnabled && (
          <button
            className={`sync-chip ${cloudConnected ? "on" : ""}`}
            onClick={() => {
              setKeyInput(accessKey ?? "");
              setAccessKey(null);
            }}
            title="同期の合言葉を変更"
          >
            {cloudConnected
              ? `🔄 同期中${accessKey ? `：${accessKey}` : ""}`
              : "⚪ 未接続"}
          </button>
        )}
      </div>

      {/* ===== 操作バー ===== */}
      <div className="yard-toolbar">
        <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
          クリア
        </button>
        <button className="btn btn-primary" onClick={addReserveVehicle}>
          ＋予備を追加
        </button>
        <span className="yard-note">実際の駐車場の配置（← 横スクロール →）</span>
      </div>

      {/* ===== 駐車場ボード（実際の形：左に1〜3、右に4〜15。1ページ内） ===== */}
      <div className="exyard">
        {/* 左：車両 3 / 2 / 1（縦列） */}
        <div className="exyard-dock">
          <div className="exyard-heading">1〜3</div>
          {dockNos.map((n) => {
            const v = byNo.get(n);
            return (
              <div className="exyard-slot" key={`dock-${n}`}>
                {v ? vehicleCardEl(v) : emptySlot(n, true)}
              </div>
            );
          })}
        </div>

        {/* 右：駐車枠 4〜15（横に並べて折り返し） */}
        <div className="exyard-floor-wrap">
          <div className="exyard-heading">駐車枠 4〜15</div>
          <div className="exyard-floor">
            {floorNos.map((n) => {
              const v = byNo.get(n);
              return (
                <div className="exyard-slot" key={`bay-${n}`}>
                  {v ? vehicleCardEl(v) : emptySlot(n, true)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 予備スペース（配置中 or 予備に車がある時だけ表示） ===== */}
      {(staging0 || reserved.length > 0) && (
        <div className="reserve-section">
          <div className="yard-section-title">予備スペース</div>
          <div className="reserve-grid">
            {staging0 && (
              <div
                className="reserve-drop staging-target"
                onClick={() => placeOnReserve()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  placeOnReserve();
                }}
              >
                ＋ 予備に配置
              </div>
            )}
            {reserved.map((v) => (
              <div className="exyard-slot" key={v.id}>
                {vehicleCardEl(v)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 帰宅済み（本日の記録・折りたたみ） ===== */}
      {departed.length > 0 && (
        <div className="departed-section">
          <div className="yard-section-title">🏠 帰宅済み（本日）</div>
          <div className="departed-grid">
            {departed.map((v) => (
              <div className="departed-slot" key={v.id}>
                {vehicleCardEl(v)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 馬コード一覧 ＋ 乳馬ボタン ===== */}
      <div className="code-list">
        <div className="yard-section-title">
          馬コード一覧
          <span className="code-hint">👆 タップ／ドラッグで枠に配置</span>
          <button
            className={`nyuba-btn ${
              staging.some((h) => h.code === "乳馬") ? "on" : ""
            }`}
            onClick={() => stageCode("乳馬")}
          >
            🍼 乳馬
          </button>
        </div>

        <div className="code-grid">
          {initialHorseCodes.map((code, i) => {
            const isStaged = staging.some((h) => h.code === code);
            return (
              <button
                key={`${code}-${i}`}
                className={`code-chip ${
                  loadedCodes.has(code.toUpperCase()) ? "loaded" : ""
                } ${isStaged ? "staged" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", code);
                  if (!isStaged) stageCode(code);
                }}
                onClick={() => stageCode(code)}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 配置バー（複数選択・最大3頭） ===== */}
      {staging0 && (
        <StagingBar
          staged={staging}
          onChange={updateStaged}
          onRemove={removeStaged}
          onClear={() => setStaging([])}
        />
      )}

      {/* ===== 詳細 / 操作モーダル ===== */}
      {openVehicle && !editing && (
        <VehicleModal
          vehicle={openVehicle}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(openVehicle)}
          onSetStatus={(horseId, status) =>
            setHorseStatus(openVehicle.id, horseId, status)
          }
          onUnloadBatch={() => unloadBatchNow(openVehicle.id)}
          onDelete={() => {
            if (confirm("この車両を削除しますか？")) deleteVehicle(openVehicle.id);
          }}
        />
      )}

      {/* ===== 編集フォーム ===== */}
      {editing && (
        <VehicleForm
          initial={editing}
          onSave={saveVehicle}
          onClose={() => setEditing(null)}
        />
      )}

      {/* ===== クリア確認 ===== */}
      {confirmClear && (
        <Modal
          title="確認"
          onClose={() => setConfirmClear(false)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmClear(false)}
              >
                キャンセル
              </button>
              <button
                className="btn btn-ghost"
                onClick={restoreSample}
                title="Excelの初期データに戻す"
              >
                初期データに戻す
              </button>
              <button
                className="btn btn-danger"
                style={{ marginLeft: "auto" }}
                onClick={doClearAll}
              >
                全てクリア
              </button>
            </>
          }
        >
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            本当に全ての車両・馬情報をクリアしますか？
            <br />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              ※この操作は取り消せません。
            </span>
          </p>
        </Modal>
      )}

      {/* ===== 同期の合言葉 入力 ===== */}
      {cloudEnabled && !accessKey && (
        <Modal
          title="🔄 リアルタイム同期"
          onClose={() => {}}
          footer={
            <button
              className="btn btn-primary btn-block"
              onClick={submitAccessKey}
            >
              この合言葉で同期を始める
            </button>
          }
        >
          <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
            みんなで同じ駐車場を共有するための<strong>合言葉</strong>
            を入力してください。
            <br />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              同じ合言葉を入れた端末どうしで、内容がリアルタイムに同期されます。
              他の人に推測されにくい言葉にしてください。
            </span>
          </p>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAccessKey();
            }}
            placeholder="例: shadai-yard-2026"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: 16,
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
            }}
          />
        </Modal>
      )}

      {/* ===== 誕生日・性別クイック編集 ===== */}
      {foalTarget && editingFoal && (
        <Modal
          title={`${foalTarget.h.horseCode || "馬"} の設定`}
          onClose={() => setEditingFoal(null)}
          footer={
            <button
              className="btn btn-primary btn-block"
              onClick={() => setEditingFoal(null)}
            >
              完了
            </button>
          }
        >
          <FoalControls
            value={{
              foalBirthDate: foalTarget.h.foalBirthDate ?? "",
              foalSex: foalTarget.h.foalSex ?? "不明",
            }}
            onChange={(patch) =>
              updateFoal(editingFoal.vehicleId, editingFoal.horseId, patch)
            }
          />
        </Modal>
      )}
    </div>
  );
}
