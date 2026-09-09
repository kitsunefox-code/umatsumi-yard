// 業務画面用の最小アイコン（絵文字の代わり）。線幅1.75・currentColor・16px基準
type P = { size?: number; className?: string };
const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "ico" + (className ? " " + className : ""),
  "aria-hidden": true,
});

export function IconWarn({ size = 14, className }: P) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5 21 19.5H3z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="16.9" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconCheck({ size = 14, className }: P) {
  return (
    <svg {...base(size, className)}>
      <path d="m5 12.5 4.3 4.3L19 7.5" />
    </svg>
  );
}
export function IconChevL({ size = 16, className }: P) {
  return (
    <svg {...base(size, className)}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  );
}
export function IconChevR({ size = 16, className }: P) {
  return (
    <svg {...base(size, className)}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}
export function IconX({ size = 14, className }: P) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
