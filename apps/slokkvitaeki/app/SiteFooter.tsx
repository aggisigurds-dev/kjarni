import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Logo light />
          <div className="footer-meta">
            Helluhraun 10, 220 Hafnarfirði · 565-4080
            <br />
            Kt 600508-0400 · Brunavarnir · Skoðun · Sala
          </div>
        </div>
        <span className="footer-badge">Frumgerð · keyrt á kjarna</span>
      </div>
    </footer>
  );
}
