"use client";

import { useState } from "react";
import { Horse, Vehicle, FoalSex, effBatch } from "@/lib/types";
import { genId } from "@/lib/storage";
import Modal from "./Modal";

function emptyHorse(): Horse {
  return {
    id: genId("horse"),
    horseCode: "",
    horseName: "",
    isBroodmare: true, // 全馬 繁殖牝馬
    foalBirthDate: "",
    foalSex: "不明",
    from: "",
    memo: "",
    unloadStatus: "not_unloaded",
  };
}

export default function VehicleForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Vehicle;
  onSave: (v: Vehicle) => void;
  onClose: () => void;
}) {
  const isNew = !initial;
  const [parkingNo, setParkingNo] = useState<string>(
    initial?.parkingNo != null ? String(initial.parkingNo) : ""
  );
  const [reserve, setReserve] = useState<boolean>(
    initial ? initial.parkingNo == null : false
  );
  const [vehicleCode, setVehicleCode] = useState(initial?.vehicleCode ?? "");
  const [unloadBatch, setUnloadBatch] = useState<number>(
    initial ? effBatch(initial) : 1
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [horses, setHorses] = useState<Horse[]>(
    initial ? initial.horses.map((h) => ({ ...h })) : [emptyHorse()]
  );

  function updateHorse(id: string, patch: Partial<Horse>) {
    setHorses((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...patch } : h))
    );
  }
  function addHorse() {
    setHorses((prev) => [...prev, emptyHorse()]);
  }
  function removeHorse(id: string) {
    setHorses((prev) => prev.filter((h) => h.id !== id));
  }

  function handleSave() {
    const v: Vehicle = {
      id: initial?.id ?? genId("vehicle"),
      parkingNo: reserve ? null : parkingNo.trim() ? Number(parkingNo) : null,
      vehicleCode: vehicleCode.trim(),
      unloadBatch: Math.max(
        1,
        Math.min(unloadBatch, horses.length || 1)
      ),
      memo: memo.trim(),
      reserve,
      horses: horses
        .filter((h) => h.horseCode.trim() || h.horseName?.trim())
        .map((h) => ({ ...h, horseCode: h.horseCode.trim() })),
    };
    onSave(v);
  }

  return (
    <Modal
      title={isNew ? "車両を追加" : "車両を編集"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-primary btn-block" onClick={handleSave}>
            保存する
          </button>
        </>
      }
    >
      <div className="checkbox-field">
        <input
          id="reserve"
          type="checkbox"
          checked={reserve}
          onChange={(e) => setReserve(e.target.checked)}
        />
        <label htmlFor="reserve">予備スペースに置く（駐車番号なし）</label>
      </div>

      <div className="field-row">
        {!reserve && (
          <div className="field">
            <label>駐車番号</label>
            <input
              type="text"
              inputMode="numeric"
              value={parkingNo}
              onChange={(e) =>
                setParkingNo(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="例: 3"
            />
          </div>
        )}
        <div className="field">
          <label>車両コード</label>
          <input
            type="text"
            value={vehicleCode}
            onChange={(e) => setVehicleCode(e.target.value)}
            placeholder="例: MAU"
          />
        </div>
      </div>

      {horses.length >= 2 && (
        <div className="field">
          <label>降ろし方式（同時に降ろせる頭数）</label>
          <div className="seg" style={{ width: "100%" }}>
            {Array.from({ length: horses.length }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                style={{ flex: 1 }}
                className={unloadBatch === n ? "active-unloaded" : ""}
                onClick={() => setUnloadBatch(n)}
              >
                {n === 1 ? "1頭ずつ" : `${n}頭同時`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>備考</label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例: RSTより"
        />
      </div>

      <div className="yard-section-title" style={{ marginTop: 16 }}>
        積載馬（{horses.length}頭）
      </div>

      {horses.map((h, i) => (
        <div className="horse-editor" key={h.id}>
          <div className="horse-editor-head">
            <strong>馬 {i + 1}</strong>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => removeHorse(h.id)}
            >
              削除
            </button>
          </div>
          <div className="field-row">
            <div className="field">
              <label>馬コード</label>
              <input
                type="text"
                value={h.horseCode}
                onChange={(e) =>
                  updateHorse(h.id, { horseCode: e.target.value })
                }
                placeholder="例: EQX"
              />
            </div>
            <div className="field">
              <label>馬名（任意）</label>
              <input
                type="text"
                value={h.horseName ?? ""}
                onChange={(e) =>
                  updateHorse(h.id, { horseName: e.target.value })
                }
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>子（乳馬）の誕生日</label>
              <input
                type="text"
                value={h.foalBirthDate ?? ""}
                onChange={(e) =>
                  updateHorse(h.id, { foalBirthDate: e.target.value })
                }
                placeholder="例: 1/25 / 不明"
              />
            </div>
            <div className="field">
              <label>子（乳馬）の性別</label>
              <select
                value={h.foalSex ?? "不明"}
                onChange={(e) =>
                  updateHorse(h.id, { foalSex: e.target.value as FoalSex })
                }
              >
                <option value="不明">不明</option>
                <option value="オス">オス</option>
                <option value="メス">メス</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>メモ</label>
            <input
              type="text"
              value={h.memo ?? ""}
              onChange={(e) => updateHorse(h.id, { memo: e.target.value })}
            />
          </div>

          <div className="field">
            <label>降ろし状態</label>
            <select
              value={h.unloadStatus}
              onChange={(e) =>
                updateHorse(h.id, {
                  unloadStatus: e.target.value as Horse["unloadStatus"],
                })
              }
            >
              <option value="not_unloaded">未降ろし</option>
              <option value="unloading">降ろし中</option>
              <option value="unloaded">降ろした</option>
            </select>
          </div>
        </div>
      ))}

      <button className="btn btn-ghost btn-block" onClick={addHorse}>
        ＋ 馬を追加
      </button>
    </Modal>
  );
}
