import { lazy, Suspense, useRef } from 'react'
import './styles.css'

const ProductExperience = lazy(() => import('./scene/ProductExperience'))

const chapters = [
  { number: '01', id: 'sound', category: 'Sound & silence', title: 'A quieter kind of focus.', note: 'Sound and active noise cancellation', side: 'left' },
  { number: '02', id: 'audio', category: 'Audio technology', title: 'Every detail, in its place.', note: 'Audio architecture and listening modes', side: 'right' },
  { number: '03', id: 'materials', category: 'Materials & engineering', title: 'Considered down to the surface.', note: 'Materials, construction, and serviceability', side: 'left' },
  { number: '04', id: 'comfort', category: 'Comfort & ergonomics', title: 'Made for the long way around.', note: 'Fit, weight, and contact materials', side: 'right' },
  { number: '05', id: 'battery', category: 'Battery & connectivity', title: 'Ready when you are.', note: 'Listening time, charging, and connections', side: 'left' },
  { number: '06', id: 'finishes', category: 'Finishes & specifications', title: 'A study in three tones.', note: 'Black · Silver · White  /  Full specifications', side: 'right' },
]

function Wordmark({ compact = false }: { compact?: boolean }) {
  return <a className={`wordmark${compact ? ' wordmark--compact' : ''}`} href="#top" aria-label="NEXUS, back to top"><span className="wordmark__symbol">N</span><span>NEXUS</span></a>
}

function Chapter({ number, id, category, title, note, side }: (typeof chapters)[number]) {
  return (
    <section className={`chapter chapter--${side}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="chapter__index"><span>{number}</span><i aria-hidden="true" /></div>
      <div className="chapter__copy">
        <p className="eyebrow">{category}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="chapter__note">{note}</p>
        <p className="chapter__pending">Product details to be confirmed</p>
      </div>
      <div className="chapter__field" aria-hidden="true"><span>{number}</span><div className="field-line" /></div>
    </section>
  )
}

function App() {
  const storyRootRef = useRef<HTMLElement | null>(null)

  return (
    <>
    <main id="top" ref={storyRootRef}>
      <header className="site-header">
        <Wordmark />
        <nav aria-label="Story chapters">
          <a href="#sound">The experience</a>
          <a href="#finishes">Specifications</a>
        </nav>
        <a className="header-cta" href="#finale">Discover NEXUS ONE <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__meta"><span>PERSONAL AUDIO / 001</span><span>DESIGNED FOR YOUR WORLD</span></div>
        <div className="hero__copy">
          <p className="eyebrow">Introducing</p>
          <h1 id="hero-title">NEXUS <span>ONE</span></h1>
          <p className="hero__tagline">Find your own frequency.</p>
          <p className="hero__description">A new expression of personal listening.<br />Meet NEXUS ONE.</p>
          <p className="hero__price">Starting at <strong>Price to be announced</strong></p>
          <a className="text-link" href="#sound">Explore the story <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero__art" aria-hidden="true">
          <span className="art__caption">OBJECT / 001</span>
          <span className="art__side-label">INTERACTIVE MODEL <span>— N° 01</span></span>
        </div>
        <div className="hero__foot"><span>SCROLL TO DISCOVER</span><span className="scroll-line" aria-hidden="true" /></div>
      </section>

      <div className="story-intro"><span className="eyebrow">The NEXUS ONE story</span><p>One object. A more considered way to listen.</p></div>
      {chapters.map((chapter) => <Chapter key={chapter.id} {...chapter} />)}

      <section className="finale" id="finale" aria-labelledby="finale-title">
        <div className="finale__visual" aria-hidden="true"><span className="finale__rule" /><span className="finale__word">N<span>.</span></span><span className="finale__rule" /></div>
        <div className="finale__copy">
          <p className="eyebrow">NEXUS / 001</p>
          <h2 id="finale-title">NEXUS ONE</h2>
          <p className="finale__tagline">Find your own frequency.</p>
          <div className="finale__details"><span>Starting price</span><strong>To be announced</strong><span>Finishes</span><strong>Black · Silver · White</strong></div>
          <button className="purchase-button" type="button" disabled aria-describedby="purchase-note">Purchase details coming soon <span aria-hidden="true">↗</span></button>
          <p className="purchase-note" id="purchase-note">Product information and availability are being finalized.</p>
        </div>
      </section>

      <footer className="site-footer"><Wordmark compact /><span>PERSONAL AUDIO, CONSIDERED.</span><a href="#top">Back to top ↑</a><small>© NEXUS 2026</small></footer>
    </main>
    <Suspense fallback={<div className="product-experience__loading" role="status">Preparing NEXUS ONE</div>}>
      <ProductExperience storyRootRef={storyRootRef} />
    </Suspense>
    </>
  )
}

export default App
