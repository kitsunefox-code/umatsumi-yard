"use client";

import {
  Vehicle,
  Horse,
  UnloadStatus,
  UNLOAD_STATUS_LABEL,
  effBatch,
} from "@/lib/types";
import Modal from "./Modal";

export default function VehicleModal({
  vehicle,
  onClose,
  onEdit,
  onSetStatus,
  onUnloadBatch,
  onDelete,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onEdit: () => void;
  onSetStatus: (horseId: string, status: UnloadStatus) => void;
  onUnloadBatch: () => void;
  onDelete: () => void;
}) {
  const remaining = vehicle.horses.filter(
    (h) => h.unloadStatus !== "unloaded"
  );
  const batch = effBatch(vehicle);
  const batchNow = Math.min(batch, remaining.length); // 今まとめて降ろせる頭数

  function foalText(h: Horse) {
    if (!h.foalBirthDate && !h.foalSex) return null;
    return `子：${h.foalBirthDate || "?"} ${
      h.foalSex && h.foalSex !== "不明" ? h.foalSex : ""
    }`.trim();
  }

  return (
    <Modal
      title={`駐車${vehicle.parkingNo ?? "予備"}　${vehicle.vehicleCode}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onEdit}>
            編集
          </button>
          <button className="btn btn-danger" onClick={onDelete}>
            この車両を削除
          </button>
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
          >
            閉じる
          </button>
        </>
      }
    >
      <div className="hint">
        {vehicle.horses.length >= 2 && (
          <>
            降ろし方式：
            <strong>{batch >= 2 ? ` ${batch}頭同時` : " 1頭ずつ"}</strong>
            {vehicle.memo ? "　／　" : ""}
          </>
        )}
        {vehicle.memo}
        {vehicle.horses.length < 2 && !vehicle.memo && "1頭積み"}
      </div>

      {/* 同時に降ろす（設定頭数ぶん） */}
      {batchNow >= 2 && (
        <button
          className="btn btn-primary btn-block"
          style={{ marginBottom: 14 }}
          onClick={onUnloadBatch}
        >
          {batchNow}頭 同時に降ろす
        </button>
      )}

      {vehicle.horses.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          馬が登録されていません。「編集」から追加してください。
        </p>
      )}

      {vehicle.horses.map((h, i) => (
        <div className="modal-op-block" key={h.id}>
          <div className="op-horse">
            <div className="info">
              <div className="horse-code-line">
                {vehicle.horses.length >= 2 && (
                  <span
                    className={`pos-badge ${
                      i === vehicle.horses.length - 1 ? "pos-back" : "pos-front"
                    }`}
                  >
                    {i === vehicle.horses.length - 1 ? "後" : "前"}
                  </span>
                )}
                <span className="horse-code">
                  {i + 1}. {h.horseCode || "?"}
                </span>
              </div>
              {foalText(h) && (
                <div className="horse-foal">{foalText(h)}</div>
              )}
            </div>
            <span className={`horse-status st-${h.unloadStatus}`}>
              {UNLOAD_STATUS_LABEL[h.unloadStatus]}
            </span>
          </div>

          {/* 状態切り替え（未降ろし / 降ろし中 / 降ろした） */}
          <div className="seg" style={{ width: "100%" }}>
            <button
              type="button"
              style={{ flex: 1 }}
              className={
                h.unloadStatus === "not_unloaded" ? "active-not" : ""
              }
              onClick={() => onSetStatus(h.id, "not_unloaded")}
            >
              未降ろし
            </button>
            <button
              type="button"
              style={{ flex: 1 }}
              className={
                h.unloadStatus === "unloading" ? "active-unloading" : ""
              }
              onClick={() => onSetStatus(h.id, "unloading")}
            >
              降ろし中
            </button>
            <button
              type="button"
              style={{ flex: 1 }}
              className={
                h.unloadStatus === "unloaded" ? "active-unloaded" : ""
              }
              onClick={() => onSetStatus(h.id, "unloaded")}
            >
              降ろした
            </button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
