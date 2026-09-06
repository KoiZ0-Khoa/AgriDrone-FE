export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="AgriDrone" translate="no">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="presentation">
          <path d="M24 8v11M15 14l9 5 9-5M11 27h26M14 22l-5 10M34 22l5 10" />
          <circle cx="8" cy="34" r="4" />
          <circle cx="40" cy="34" r="4" />
          <path className="brand-leaf" d="M24 39c-6-6-4-12 4-14 2 7 0 11-4 14Z" />
        </svg>
      </span>
      {compact ? null : (
        <span className="brand-copy">
          <strong>AgriDrone</strong>
          <small>VẬN HÀNH NÔNG TRẠI</small>
        </span>
      )}
    </div>
  )
}
