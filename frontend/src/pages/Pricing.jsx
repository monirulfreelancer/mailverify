import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import '../landing.css';

/**
 * Public marketing "Pricing" page (served on the marketing host, like Landing).
 *
 * The four paid credit packages mirror the backend seed (GET /payments/packages):
 *   Starter 1,000 = 200 BDT · Basic 5,000 = 800 · Pro 25,000 = 3,000 · Business 100,000 = 10,000.
 * That endpoint requires auth, so a logged-out visitor can't call it — we hardcode
 * the four packages here. If they ever drift from the seed, update this list.
 *
 * Auth CTAs link to the app host (auth lives on app.goanglelead.com).
 */

const APP_URL = 'https://app.goanglelead.com';

// Free tier (25 credits granted on signup) + the four seeded paid packages.
const PLANS = [
  {
    name: 'Free',
    price: '0',
    currency: 'BDT',
    credits: '25 credits on signup',
    blurb: 'Try every check with no credit card.',
    cta: 'Start free',
    popular: false,
  },
  {
    name: 'Starter',
    price: '200',
    currency: 'BDT',
    credits: '1,000 credits',
    blurb: 'For small lists and the occasional clean-up.',
    cta: 'Get Starter',
    popular: false,
  },
  {
    name: 'Basic',
    price: '800',
    currency: 'BDT',
    credits: '5,000 credits',
    blurb: 'For regular senders keeping lists fresh.',
    cta: 'Get Basic',
    popular: false,
  },
  {
    name: 'Pro',
    price: '3,000',
    currency: 'BDT',
    credits: '25,000 credits',
    blurb: 'For growing teams verifying at scale.',
    cta: 'Get Pro',
    popular: true,
  },
  {
    name: 'Business',
    price: '10,000',
    currency: 'BDT',
    credits: '100,000 credits',
    blurb: 'Best value per credit for high volume.',
    cta: 'Get Business',
    popular: false,
  },
];

const PERKS = [
  'Single & bulk verification',
  'SMTP, MX, catch-all & disposable checks',
  'REST API access with API keys',
  'Verification history',
];

const FAQS = [
  {
    q: 'Do credits expire?',
    a: 'No. Credits never expire — validity is lifetime. Top up once and use them whenever you need to verify.',
  },
  {
    q: 'How do I pay?',
    a: 'Payment is manual for now. Send the exact amount via bKash, Rocket, Nagad or bank transfer, then submit your transaction ID from the Buy Credits page. We verify it and add your credits, usually within a short while.',
  },
  {
    q: 'How much does one verification cost?',
    a: 'Each address you verify uses one credit. A package of 5,000 credits checks 5,000 addresses — single or bulk, it’s the same rate.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. Signing up gives you 25 free credits with no card required, so you can try every check before buying.',
  },
];

export default function Pricing() {
  return (
    <div className="lp">
      <MarketingNav />

      {/* ---------- Hero ---------- */}
      <section className="lp-section lp-page-hero">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Pricing</span>
            <h1 className="lp-page-title">
              Simple, <span className="lp-grad">credit-based</span> pricing
            </h1>
            <p>
              Start free with 25 credits, then buy only the credits you need.
              <strong> Credits never expire — validity: lifetime.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Pricing cards ---------- */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-container">
          <div className="lp-pricing-grid lp-pricing-grid-5">
            {PLANS.map((plan) => (
              <div className={`lp-price-card${plan.popular ? ' popular' : ''}`} key={plan.name}>
                {plan.popular && <span className="lp-price-tag">Best value</span>}
                <div className="lp-price-name">{plan.name}</div>
                <div className="lp-price-amount">
                  {plan.price}
                  <span> {plan.currency}</span>
                </div>
                <div className="lp-price-quota">{plan.credits}</div>
                <p className="lp-price-blurb">{plan.blurb}</p>
                <a
                  href={`${APP_URL}/signup`}
                  className={`btn btn-block btn-lg ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="lp-price-note">
            Every plan includes: {PERKS.join(' · ')}.
          </p>
          <p className="lp-price-note" style={{ marginTop: 8 }}>
            Payment is manual for now — pay via <strong>bKash</strong>, <strong>Rocket</strong>,{' '}
            <strong>Nagad</strong> or <strong>bank transfer</strong>, then submit your transaction ID.
          </p>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section
        className="lp-section"
        id="faq"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">FAQ</span>
            <h2>Pricing questions</h2>
          </div>
          <div className="lp-faq">
            {FAQS.map((item, i) => (
              <details className="lp-faq-item" key={item.q} open={i === 0}>
                <summary>{item.q}</summary>
                <p className="lp-faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-cta">
            <h2>Start verifying for free</h2>
            <p>Create an account in seconds and get 25 free credits — no credit card required.</p>
            <a href={`${APP_URL}/signup`} className="btn btn-lg lp-btn-on-dark">
              Sign up free
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
