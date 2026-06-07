import Link from "next/link";

/** Shared site header. `right` lets each page inject auth-aware actions. */
export default function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/brand/aguita-logo-gradient.png" alt="Agüita House" />
        <div className="brand-text">
          <h1>surf</h1>
          <p className="brand-sub">la cícer · las palmas de gran canaria</p>
        </div>
      </Link>
      <div className="header-actions">
        {right ?? (
          <div className="credits">
            <p>by <strong>Nicola Gasparro</strong> &amp; <strong>Vicente Matus</strong></p>
            <p className="sponsor">sponsored by <strong>IDeTIC · ULPGC</strong></p>
          </div>
        )}
      </div>
    </header>
  );
}
