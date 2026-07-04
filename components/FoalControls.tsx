"use client";

import { FoalSex } from "@/lib/types";

export type FoalValue = {
  foalBirthDate: string; // "M/D" または "不明"
  foalSex: FoalSex;
};

function parseMD(s: string): { mo: number; d: number } {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec((s || "").trim());
  return m ? { mo: +m[1], d: +m[2] } : { mo: 1, d: 1 };
}
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export default function FoalControls({
  value,
  onChange,
}: {
  value: FoalValue;
  onChange: (patch: Partial<FoalValue>) => void;
}) {
  const bd = (value.foalBirthDate || "").trim();
  const isUnknown = bd === "不明";
  const hasDate = /^\d{1,2}\/\d{1,2}$/.test(bd);
  const { mo, d } = parseMD(value.foalBirthDate);
  const setMD = (nmo: number, nd: number) =>
    onChange({ foalBirthDate: `${clamp(nmo, 1, 12)}/${clamp(nd, 1, 31)}` });

  return (
    <div className="foal-controls">
      {/* 性別 */}
      <div className="seg">
        <button
          type="button"
          className={value.foalSex === "オス" ? "active-male" : ""}
          onClick={() => onChange({ foalSex: "オス" })}
        >
          オス
        </button>
        <button
          type="button"
          className={value.foalSex === "メス" ? "active-female" : ""}
          onClick={() => onChange({ foalSex: "メス" })}
        >
          メス
        </button>
        <button
          type="button"
          className={value.foalSex === "不明" ? "active-not" : ""}
          onClick={() => onChange({ foalSex: "不明" })}
        >
          不明
        </button>
      </div>

      {/* 誕生日ステッパー（＋ 不明） */}
      <div className="birth-stepper">
        <span className="bs-label">誕生日</span>
        {hasDate ? (
          <>
            <button type="button" onClick={() => setMD(mo - 1, d)}>
              −
            </button>
            <span className="bs-val">{mo}</span>
            <span className="bs-unit">月</span>
            <button type="button" onClick={() => setMD(mo + 1, d)}>
              ＋
            </button>
            <button type="button" onClick={() => setMD(mo, d - 1)}>
              −
            </button>
            <span className="bs-val">{d}</span>
            <span className="bs-unit">日</span>
            <button type="button" onClick={() => setMD(mo, d + 1)}>
              ＋
            </button>
            <button
              type="button"
              className="bs-clear"
              onClick={() => onChange({ foalBirthDate: "" })}
            >
              クリア
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="bs-set"
              onClick={() => onChange({ foalBirthDate: "1/1" })}
            >
              ＋ 日付入力
            </button>
            <button
              type="button"
              className={`bs-unknown ${isUnknown ? "on" : ""}`}
              onClick={() =>
                onChange({ foalBirthDate: isUnknown ? "" : "不明" })
              }
            >
              不明
            </button>
          </>
        )}
      </div>
    </div>
  );
}
