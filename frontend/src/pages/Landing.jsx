import { useState, useEffect } from 'react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import '../landing.css';

/**
 * Marketing landing page served on the marketing host (goanglelead.com and,
 * during dev, localhost). The app itself lives on a separate domain, so every
 * auth call-to-action navigates to the app host with a full-page <a href>
 * (NOT a react-router <Link>, which would stay on the marketing domain).
 *
 * There is no public verification API, so the hero email capture simply
 * routes the visitor to the app's /signup, passing the typed email along as
 * ?email= so the signup form can prefill it.
 *
 * All styles live in src/landing.css under the "lp-" prefix to avoid any
 * collision with the app's global styles.
 */

// The app lives on a separate domain. All auth CTAs link here as absolute URLs.
const APP_URL = 'https://app.goanglelead.com';

/* ---------- Small inline SVG icon set (no external icon dependency) ---------- */

function IconBolt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
function IconNet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconServer() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="8" rx="2" />
      <rect x="2" y="13" width="20" height="8" rx="2" />
      <path d="M6 7h.01M6 17h.01" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IconCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}
function IconKeyboard() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  );
}
function IconScan() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M3 12h18" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

/* ---------- Content data ---------- */

const FEATURES = [
  {
    icon: <IconBolt />,
    title: 'Real-time SMTP verification',
    desc: 'We connect to the mail server and confirm the mailbox exists — no test email is ever sent.',
  },
  {
    icon: <IconNet />,
    title: 'Catch-all detection',
    desc: 'Identify domains that accept every address so you can score risky sends accordingly.',
  },
  {
    icon: <IconTrash />,
    title: 'Disposable email detection',
    desc: 'Flag throwaway and temporary inboxes before they pollute your list.',
  },
  {
    icon: <IconUser />,
    title: 'Role-based address detection',
    desc: 'Spot shared addresses like info@ and support@ that hurt engagement rates.',
  },
  {
    icon: <IconServer />,
    title: 'MX & DNS validation',
    desc: 'Check that the domain actually has valid mail records and can receive email.',
  },
  {
    icon: <IconCode />,
    title: 'Developer-friendly REST API',
    desc: 'Verify a single address or integrate bulk checks with a clean, documented API.',
  },
];

const TRUST_SIGNALS = [
  { icon: <IconBolt />, label: 'Real-time SMTP' },
  { icon: <IconShield />, label: 'GDPR-friendly' },
  { icon: <IconTarget />, label: 'Up to 99% accuracy' },
  { icon: <IconCard />, label: 'No credit card required' },
];

const STATS = [
  { value: 'Up to 99%', label: 'Verification accuracy' },
  { value: 'Real time', label: 'Live SMTP mailbox checks' },
  { value: 'Catch-all', label: '& disposable detection' },
  { value: '25 free', label: 'Verifications on signup' },
];

const STEPS = [
  {
    icon: <IconKeyboard />,
    title: 'Enter or upload emails',
    desc: 'Paste a single address in your dashboard or send it through the API.',
    soon: false,
  },
  {
    icon: <IconScan />,
    title: 'We run every check',
    desc: 'Syntax, MX records, SMTP mailbox, catch-all and disposable detection — in real time.',
    soon: false,
  },
  {
    icon: <IconDownload />,
    title: 'Get clean, deliverable lists',
    desc: 'Receive a clear status and confidence score for every address you verify.',
    soon: false,
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    quota: '25 verifications on signup',
    features: ['Single verification', 'API access', 'Dashboard included'],
    cta: 'Start free',
    popular: false,
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/mo',
    quota: '5,000 verifications / mo',
    features: ['Everything in Free', 'Higher monthly quota', 'Verification history'],
    cta: 'Get started',
    popular: false,
  },
  {
    name: 'Growth',
    price: '$79',
    period: '/mo',
    quota: '25,000 verifications / mo',
    features: ['Everything in Starter', 'Priority verification', 'Email support'],
    cta: 'Get started',
    popular: true,
  },
  {
    name: 'Scale',
    price: '$249',
    period: '/mo',
    quota: '100,000 verifications / mo',
    features: ['Everything in Growth', 'Highest throughput', 'Priority support'],
    cta: 'Get started',
    popular: false,
  },
];

const FAQS = [
  {
    q: 'What is email verification?',
    a: 'Email verification checks whether an address is real and able to receive mail without sending a message to it. It validates the syntax, looks up the domain’s mail (MX) records, and queries the mail server over SMTP to confirm the mailbox exists.',
  },
  {
    q: 'How accurate is it?',
    a: 'We combine syntax checks, DNS/MX lookups and live SMTP probing, then return a confidence score for each address. Most mailboxes can be confirmed definitively; a small number of providers hide mailbox status, which we report transparently as catch-all or unknown.',
  },
  {
    q: 'Do you store my data?',
    a: 'We only keep what you need to use the product — your account and your verification history so you can review past results. We never send email to the addresses you check and we don’t sell your data.',
  },
  {
    q: 'What’s a catch-all address?',
    a: 'A catch-all (or accept-all) domain is configured to accept mail for every possible address, so the server can’t tell us whether a specific mailbox truly exists. We flag these so you can decide how much risk to take on those sends.',
  },
  {
    q: 'Can I use the API?',
    a: 'Yes. Every plan, including Free, includes REST API access. Generate a key from your dashboard and verify addresses programmatically from your own app or workflow.',
  },
];

/* ---------- Page ---------- */

export default function Landing() {
  const [email, setEmail] = useState('');

  // Subtle scroll-in animations: reveal any element tagged `.lp-reveal` once it
  // scrolls into view. Pure vanilla IntersectionObserver — no animation library.
  // Respects prefers-reduced-motion by simply revealing everything immediately.
  useEffect(() => {
    const els = document.querySelectorAll('.lp-reveal');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // No public API — send the visitor to the app's signup on the app host,
  // prefilling the email if one was typed. Full-page navigation across domains.
  function handleHeroSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    window.location.href = trimmed
      ? `${APP_URL}/signup?email=${encodeURIComponent(trimmed)}`
      : `${APP_URL}/signup`;
  }

  return (
    <div className="lp">
      {/* ---------- Sticky nav (shared marketing navbar) ---------- */}
      <MarketingNav />

      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill lp-enter lp-enter-1">
              <span className="dot" />
              Real-time SMTP verification
            </span>
            <h1 className="lp-enter lp-enter-2">
              Verify email addresses <span className="lp-grad">in real time.</span>
            </h1>
            <p className="lp-hero-sub lp-enter lp-enter-3">
              Stop bounces before they happen. mailverify checks every address against
              live mail servers so you protect your sender reputation and reach real
              inboxes.
            </p>

            <form className="lp-hero-form lp-enter lp-enter-4" onSubmit={handleHeroSubmit} noValidate>
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn btn-primary btn-lg" type="submit">
                Verify for free
              </button>
            </form>
            <p className="lp-trust-text lp-enter lp-enter-5">
              <strong>25 free verifications</strong> • No credit card required
            </p>
          </div>

          {/* Decorative mock result card (static — mirrors the real ResultCard look) */}
          <div className="lp-hero-visual lp-enter lp-enter-4" aria-hidden="true">
            <div className="lp-mock-card">
              <div className="lp-mock-head">
                <div>
                  <div className="lp-mock-email">jordan@company.com</div>
                  <div className="lp-mock-sub">deliverable mailbox</div>
                </div>
                <span className="lp-mock-badge lp-mock-badge-pulse">Valid</span>
              </div>
              <div className="lp-mock-body">
                <div className="lp-mock-score-top">
                  <span className="lp-mock-score-num">
                    98 <span className="lp-mock-score-cap" style={{ color: 'var(--text-muted)' }}>/ 100</span>
                  </span>
                  <span className="lp-mock-score-cap">Confidence score</span>
                </div>
                <div className="lp-mock-track">
                  <div className="lp-mock-fill" />
                </div>
                <div className="lp-mock-flags">
                  <div className="lp-mock-flag">
                    <span>MX found</span>
                    <span className="yes">Yes</span>
                  </div>
                  <div className="lp-mock-flag">
                    <span>SMTP confirmed</span>
                    <span className="yes">Yes</span>
                  </div>
                  <div className="lp-mock-flag">
                    <span>Disposable</span>
                    <span className="no">No</span>
                  </div>
                  <div className="lp-mock-flag">
                    <span>Catch-all</span>
                    <span className="no">No</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Trust signals strip ---------- */}
      <section className="lp-trust">
        <div className="lp-container">
          <p className="lp-trust-label">Built for senders who care about deliverability</p>
          <div className="lp-trust-row">
            {TRUST_SIGNALS.map((t) => (
              <div className="lp-trust-badge" key={t.label}>
                <span className="lp-trust-badge-icon">{t.icon}</span>
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Stats band ---------- */}
      <section className="lp-stats">
        <div className="lp-container">
          <div className="lp-stats-grid">
            {STATS.map((s) => (
              <div className="lp-stat lp-reveal" key={s.label}>
                <div className="lp-stat-value">{s.value}</div>
                <div className="lp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="lp-section" id="features">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Features</span>
            <h2>Everything you need for clean lists</h2>
            <p>A complete verification engine behind a simple dashboard and API.</p>
          </div>
          <div className="lp-features-grid">
            {FEATURES.map((f, i) => (
              <div
                className="lp-feature lp-reveal"
                key={f.title}
                style={{ transitionDelay: `${(i % 3) * 70}ms` }}
              >
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="lp-section" id="how-it-works" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">How it works</span>
            <h2>From raw list to deliverable in three steps</h2>
            <p>No complex setup — start verifying the moment you sign up.</p>
          </div>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div
                className="lp-step lp-reveal"
                key={s.title}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <div className="lp-step-top">
                  <div className="lp-step-icon">{s.icon}</div>
                  <span className="lp-step-num">{i + 1}</span>
                </div>
                <h3>
                  {s.title}
                  {i === 0 && <span className="lp-badge-soon">Bulk CSV — Coming soon</span>}
                </h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section className="lp-section" id="pricing">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Pricing</span>
            <h2>Simple, transparent pricing</h2>
            <p>Start free with 25 verifications. Upgrade as you grow.</p>
          </div>
          <div className="lp-pricing-grid">
            {PLANS.map((plan, i) => (
              <div
                className={`lp-price-card lp-reveal${plan.popular ? ' popular' : ''}`}
                key={plan.name}
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                {plan.popular && <span className="lp-price-tag">Most popular</span>}
                <div className="lp-price-name">{plan.name}</div>
                <div className="lp-price-amount">
                  {plan.price}
                  {plan.period && <span>{plan.period}</span>}
                </div>
                <div className="lp-price-quota">{plan.quota}</div>
                <ul className="lp-price-features">
                  {plan.features.map((feat) => (
                    <li key={feat}>
                      <IconCheck />
                      {feat}
                    </li>
                  ))}
                </ul>
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
            Bulk pricing and higher volumes coming soon — <a href="#contact">contact us</a>.
          </p>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="lp-section" id="faq" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">FAQ</span>
            <h2>Frequently asked questions</h2>
          </div>
          <div className="lp-faq">
            {FAQS.map((item, i) => (
              // First item open by default for a friendlier first impression.
              <details className="lp-faq-item" key={item.q} open={i === 0}>
                <summary>{item.q}</summary>
                <p className="lp-faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-cta lp-reveal">
            <h2>Start verifying for free</h2>
            <p>
              Create an account in seconds and get 25 free verifications — no credit card
              required.
            </p>
            <a href={`${APP_URL}/signup`} className="btn btn-lg lp-btn-on-dark">
              Sign up free
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Footer (shared marketing footer) ---------- */}
      <MarketingFooter />
    </div>
  );
}
