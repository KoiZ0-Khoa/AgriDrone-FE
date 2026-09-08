export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="AgriDrone" translate="no">
      <span className="brand-symbol" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}brand/emblem.png`} alt="" width="432" height="288" />
      </span>
      {compact ? null : (
        <span className="brand-copy">
          <strong><span className="brand-agri">Agri</span>Drone</strong>
          <small>VẬN HÀNH NÔNG TRẠI</small>
        </span>
      )}
    </div>
  )
}
