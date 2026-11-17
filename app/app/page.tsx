import Link from "next/link";
import "../styles/landing.css";

const principles = [
  {
    index: "01",
    title: "Price discovery beyond the book",
    copy: "Every supported Gemini strike gets an options-implied theoretical price, including tails where the visible book can be thin.",
  },
  {
    index: "02",
    title: "Risk that changes with the market",
    copy: "Binary gamma drives a per-market leverage cap, so sharp contracts receive less leverage and calmer contracts can receive more.",
  },
  {
    index: "03",
    title: "Liquidity that starts with trading",
    copy: "Losses bootstrap the experimental pool instead of requiring an outside LP deposit. Profitable claims remain subject to available vault liquidity.",
  },
] as const;

export default function LandingPage() {
  return <div className="landing-page">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <p className="landing-kicker"><span /> SOLANA DEVNET · GEMINI PREDICTION MARKETS</p>
        <h1 id="landing-title">Every strike.<br /><em>One fair surface.</em></h1>
        <p className="landing-lede">Wick turns Gemini&apos;s BTC prediction markets into risk-capped synthetic YES/NO positions, priced from the options volatility surface.</p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/trade">Open trading terminal <span aria-hidden="true">↗</span></Link>
          <Link className="landing-secondary" href="/pool">Explore the pool <span aria-hidden="true">→</span></Link>
        </div>
        <div className="landing-proof" aria-label="Product principles">
          <div><b>Gemini</b><span>Official outcomes</span></div>
          <div><b>Options IV</b><span>Independent fair value</span></div>
          <div><b>Solana</b><span>Devnet execution</span></div>
        </div>
      </div>

      <div className="landing-surface" aria-label="Wick pricing surface illustration">
        <div className="landing-surface-head">
          <div><span className="landing-surface-mark" /> WICK PRICING SURFACE</div>
          <span>Verified data only</span>
        </div>
        <div className="landing-contract">
          <span>GEMINI CONTRACT</span>
          <strong>BTC outcome market</strong>
          <small>Quote + captured strike</small>
        </div>
        <div className="landing-flow" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="landing-model">
          <div>
            <span>OPTIONS SURFACE</span>
            <strong>Spot + implied volatility</strong>
          </div>
          <div className="landing-model-output">
            <span>WICK OUTPUT</span>
            <b>Fair theo</b>
            <b>Risk cap</b>
          </div>
        </div>
        <div className="landing-surface-foot">
          <span>Live values appear only when the backend is healthy and fresh.</span>
          <Link href="/trade">View markets →</Link>
        </div>
      </div>
    </section>

    <section className="landing-feature" aria-labelledby="landing-feature-title">
      <div className="landing-section-copy">
        <p className="landing-kicker"><span /> THE WHOLE LADDER</p>
        <h2 id="landing-feature-title">A reference price where the order book goes quiet.</h2>
        <p>Wick places the model beside Gemini—not over it—so traders can compare the venue quote, independent theo, edge, and live cap in one dense surface.</p>
        <Link href="/trade">Inspect the live ladder <span aria-hidden="true">→</span></Link>
      </div>
      <div className="landing-compare" aria-label="Market and model comparison illustration">
        <div className="landing-compare-head"><span>Source</span><span>Signal</span><span>Use</span></div>
        <div className="landing-compare-row">
          <div><i className="landing-gemini" /> Gemini</div><strong>Bid / ask</strong><span>Market reference</span>
        </div>
        <div className="landing-compare-join" aria-hidden="true"><i /><i /><i /></div>
        <div className="landing-compare-row landing-compare-row-accent">
          <div><i className="landing-wick" /> Wick</div><strong>Fair theo</strong><span>Pricing signal</span>
        </div>
        <div className="landing-compare-note">No invented liquidity. No fabricated live state.</div>
      </div>
    </section>

    <section className="landing-principles" aria-labelledby="landing-principles-title">
      <div className="landing-principles-head">
        <div><p className="landing-kicker"><span /> BUILT FOR THE TAILS</p><h2 id="landing-principles-title">A prediction market risk engine, visible at every step.</h2></div>
        <p>From the first quote to official settlement, Wick keeps the source, model, cap, and current system state in view.</p>
      </div>
      <div className="landing-principle-grid">
        {principles.map((principle) => <article className="landing-principle" key={principle.index}>
          <span>{principle.index}</span>
          <div className="landing-principle-glyph" aria-hidden="true"><i /><i /><i /></div>
          <h3>{principle.title}</h3>
          <p>{principle.copy}</p>
        </article>)}
      </div>
    </section>

    <section className="landing-faq" aria-labelledby="landing-faq-title">
      <div className="landing-faq-head">
        <p className="landing-kicker"><span /> QUESTIONS, ANSWERED</p>
        <h2 id="landing-faq-title">What Wick shows. And what it never invents.</h2>
      </div>
      <div className="landing-faq-list">
        <details open>
          <summary>Where does the market data come from?</summary>
          <p>Wick displays Gemini market outcomes beside an independent options-implied theoretical price. If those sources are unavailable or stale, the terminal says so.</p>
        </details>
        <details>
          <summary>Are these real-money positions?</summary>
          <p>No. The current product is an experimental Solana devnet experience using test USDC only.</p>
        </details>
        <details>
          <summary>How are leverage limits set?</summary>
          <p>Each market receives a dynamic cap derived from binary gamma, so riskier contracts allow less leverage.</p>
        </details>
      </div>
    </section>

    <section className="landing-final">
      <p className="landing-kicker"><span /> WICK TERMINAL</p>
      <h2>See the real surface.<br /><em>Trade the verified state.</em></h2>
      <p>Open the terminal for current Gemini markets, options-implied theo, and backend health. If live data is unavailable or stale, Wick says so.</p>
      <Link className="landing-primary" href="/trade">Enter the terminal <span aria-hidden="true">↗</span></Link>
    </section>
  </div>;
}
