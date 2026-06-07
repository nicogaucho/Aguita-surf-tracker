import Link from "next/link";

/** Shared site header. `right` lets each page inject auth-aware actions. */
export default function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <div className="brand-mark" aria-hidden="true">🌊</div>
        <div className="brand-text">
          <h1>Agüita <span>Surf</span></h1>
          <p className="brand-sub">La Cícer Beach · Las Palmas de Gran Canaria</p>
        </div>
      </Link>
      <div className="header-actions">
        {right ?? (
          <div className="credits">
            <p>by <strong>Nicola Gasparro</strong> &amp; <strong>Vicente Matus</strong></p>
            <p className="sponsor">Sponsored by <strong>IDeTIC · ULPGC</strong></p>
          </div>
        )}
      </div>
    </header>
  );
}
