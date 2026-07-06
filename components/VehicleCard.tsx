"use client";

import { useState } from "react";
import {
  Vehicle,
  Horse,
  UNLOAD_STATUS_LABEL,
  effBatch,
  wakuClass,
} from "@/lib/types";

function FoalInfo({ horse }: { horse: Horse }) {
  const { foalBirthDate: birth, foalSex: sex } = horse;
  const sexClass =
    sex === "オス" ? "sex-male" : sex === "メス" ? "sex-female" : "";
  return (
    <span className="horse-foal">
      子：{birth || "-"}{" "}
      {sex && sex !== "不明" && <span className={sexClass}>{sex}</span>}
    </span>
  );
}

export default function VehicleCard({
  vehicle,
  staging,
  onOpen,
  onQuickUnload,
  onUnloadStall,
  onCycleBatch,
  onEditFoal,
  onDropHorse,
  onSwapHorses,
  onGoHome,
}: {
  vehicle: Vehicle;
  staging: boolean;
  onOpen: () => void;
  onQuickUnload: (horseId: string) => void;
  onUnloadStall: (horseId: string) => void;
  onCycleBatch: () => void;
  onEditFoal: (horseId: string) => void;
  onDropHorse: () => void;
  onSwapHorses: () => void;
  onGoHome: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const count = vehicle.horses.length;
  const two = count >= 2; // 複数頭（方式・前後を表示する条件）
  const batch = effBatch(vehicle); // 同時に降ろせる頭数
  const batchLabel = batch >= 2 ? `${batch}頭同時` : "1頭ずつ";
  const allUnloaded =
    count > 0 && vehicle.horses.every((h) => h.unloadStatus === "unloaded");
  const wentHome = !!vehicle.wentHome;
  const codesStr = vehicle.horses
    .map((h) => h.horseCode)
    .filter(Boolean)
    .join("・");

  // 滞在時間の警告（到着から30分以上、まだ降ろしていない）
  const elapsedMin =
    vehicle.arrivedTs != null
      ? Math.floor((Date.now() - vehicle.arrivedTs) / 60000)
      : null;
  const overdue =
    !wentHome && !allUnloaded && elapsedMin != null && elapsedMin >= 30;

  // 帰宅済み：小さくグレー表示（帰宅時刻＋馬コードのみ）。リボンで開閉。
  if (wentHome && !expanded) {
    return (
      <div className="vcard went-home collapsed">
        <button className="wh-strip" onClick={() => setExpanded(true)}>
          <span className="wh-ribbon">▸</span>
          <span className={`wh-no ${wakuClass(vehicle.parkingNo)}`}>
            {vehicle.parkingNo ?? "予備"}
          </span>
          <span className="wh-codes">{codesStr || "—"}</span>
          <span className="wh-time">🏠 {vehicle.departedAt}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`vcard ${allUnloaded ? "all-unloaded" : ""} ${
        wentHome ? "went-home" : ""
      } ${overdue ? "overdue" : ""} ${staging ? "staging-target" : ""} ${
        dragOver ? "drag-over" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropHorse();
      }}
    >
      {wentHome && (
        <button
          className="wh-strip wh-open"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
        >
          <span className="wh-ribbon">▾</span>
          <span className="wh-time">🏠 帰宅 {vehicle.departedAt}</span>
          <span className="wh-close">閉じる</span>
        </button>
      )}

      <div className="vcard-head" onClick={onOpen}>
        <div
          className={`vcard-no ${
            vehicle.parkingNo == null ? "reserve" : wakuClass(vehicle.parkingNo)
          }`}
        >
          {vehicle.parkingNo ?? "予備"}
        </div>
        <div className="vcard-code">
          {codesStr}
          {vehicle.vehicleCode && (
            <span className="vcard-truck">🚚{vehicle.vehicleCode}</span>
          )}
        </div>
        {two && (
          <span
            className={`badge ${batch >= 2 ? "badge-double" : "badge-single"}`}
          >
            {batchLabel}
          </span>
        )}
      </div>

      {vehicle.arrivedAt && (
        <div className="vcard-arrived">🕐 到着 {vehicle.arrivedAt}</div>
      )}

      {overdue && (
        <div className="vcard-overdue">
          ⚠️ 到着から{elapsedMin}分・未降ろし（30分超過）
        </div>
      )}

      {staging && (
        <div className="staging-drop-hint" onClick={onDropHorse}>
          ＋ ここに配置
        </div>
      )}

      <div className="vcard-body">
        {count === 0 && (
          <div className="horse-row">
            <span className="horse-from">馬が未登録です</span>
          </div>
        )}
        {vehicle.horses.map((h, i) => (
          <div
            key={h.id}
            className={`horse-row ${
              h.unloadStatus === "unloaded"
                ? "row-unloaded"
                : h.unloadStatus === "unloading"
                ? "row-unloading"
                : ""
            }`}
          >
            <div className="horse-main">
              <div className="horse-code-line">
                {two && (
                  <span
                    className={`pos-badge ${
                      i === count - 1 ? "pos-back" : "pos-front"
                    }`}
                  >
                    {i === count - 1 ? "後" : "前"}
                  </span>
                )}
                <span className="horse-code">{h.horseCode || "?"}</span>
                <span className={`horse-status st-${h.unloadStatus}`}>
                  {UNLOAD_STATUS_LABEL[h.unloadStatus]}
                </span>
              </div>
              <FoalInfo horse={h} />
            </div>
            <div className="horse-actions">
              <button
                className="btn btn-sm btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditFoal(h.id);
                }}
              >
                誕生日
              </button>
              {h.unloadStatus !== "unloaded" ? (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickUnload(h.id);
                    }}
                  >
                    降ろす
                  </button>
                  <button
                    className="btn btn-sm btn-stall"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnloadStall(h.id);
                    }}
                  >
                    待機馬房
                  </button>
                </>
              ) : (
                <span className="horse-status st-unloaded">
                  完了{h.unloadTo === "待機馬房" ? "・待機馬房" : ""}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 下部 */}
      {wentHome ? (
        <div className="vcard-foot">
          <span className="wenthome-badge">
            🏠 帰宅済{vehicle.departedAt ? `（${vehicle.departedAt}）` : ""}
          </span>
        </div>
      ) : allUnloaded ? (
        <div className="vcard-foot">
          <button
            className="btn gohome-btn"
            onClick={(e) => {
              e.stopPropagation();
              onGoHome();
            }}
          >
            🏠 帰宅
          </button>
        </div>
      ) : two ? (
        <div className="vcard-foot">
          <button
            className="btn btn-sm btn-ghost swap-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSwapHorses();
            }}
          >
            ⇅ 前後入替
          </button>
          <button
            className={`toggle-type ${batch >= 2 ? "is-double" : "is-single"}`}
            onClick={(e) => {
              e.stopPropagation();
              onCycleBatch();
            }}
          >
            {batchLabel}
            <span className="toggle-hint">切替</span>
          </button>
        </div>
      ) : null}

      {vehicle.memo && <div className="vcard-memo">📝 {vehicle.memo}</div>}
    </div>
  );
}
