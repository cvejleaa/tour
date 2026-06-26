// Dekorativ hero-banner med Tour de France-tema. Bruges øverst på forsiden.
export default function Hero({ title, subtitle, chips = [] }) {
  return (
    <section className="hero">
      <h1 className="hero__title">
        <span className="hero__ball">🚴</span>
        {title}
      </h1>
      {subtitle && <p className="hero__subtitle">{subtitle}</p>}
      {chips.length > 0 && (
        <div className="hero__badges">
          {chips.map((c) => (
            <span className="hero__chip" key={c}>{c}</span>
          ))}
        </div>
      )}
    </section>
  );
}
