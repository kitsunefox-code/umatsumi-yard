"use client";

import { FoalSex } from "@/lib/types";
import FoalControls from "./FoalControls";

export type StagedHorse = {
  id: string;
  code: string;
  foalBirthDate: string;
  foalSex: FoalSex;
};

export default function StagingBar({
  staged,
  onChange,
  onRemove,
  onClear,
}: {
  staged: StagedHorse[];
  onChange: (id: string, patch: Partial<StagedHorse>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="staging-bar">
      <div className="staging-inner">
        <div className="staging-row1">
          <span className="staging-label">
            🐴 配置する馬（{staged.length}/3）
          </span>
          <button className="btn btn-sm btn-danger" onClick={onClear}>
            全解除
          </button>
        </div>

        <div className="staged-list">
          {staged.map((h, i) => (
            <div className="staged-horse" key={h.id}>
              <div className="staged-head">
                <span className="staged-pos">{i + 1}</span>
                <span className="staged-code">{h.code}</span>
                <button
                  className="staged-x"
                  onClick={() => onRemove(h.id)}
                  aria-label="外す"
                >
                  ×
                </button>
              </div>
              <FoalControls
                value={{
                  foalBirthDate: h.foalBirthDate,
                  foalSex: h.foalSex,
                }}
                onChange={(patch) => onChange(h.id, patch)}
              />
            </div>
          ))}
        </div>

        <p className="staging-hint">
          👆 コードを追加でタップ（最大3頭）→ 配置する駐車枠をタップ／空き枠にドロップ
        </p>
      </div>
    </div>
  );
}
