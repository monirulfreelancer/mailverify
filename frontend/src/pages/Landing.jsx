import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import '../landing.css';

/**
 * Marketing landing page shown at "/" for logged-OUT visitors.
 * (Authenticated users see the Dashboard instead — see src/App.jsx.)
 *
 * There is no public verification API, so the hero email capture simply
 * routes the visitor to /signup, passing the typed email along as ?email=
 * so the signup form can prefill it.
 *
 * All styles live in src/landing.css under the "lp-" prefix to avoid any
 * collision with the app's global styles.
 */

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

const STEPS = [
  {
    title: 'Enter or upload emails',
    desc: 'Paste a single address in your dashboard or send it through the API.',
    soon: false,
  },
  {
    title: 'We run every check',
    desc: 'Syntax, MX records, SMTP mailbox, catch-all and disposable detection — in real time.',
    soon: false,
  },
  {
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
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  // No public API — route to signup, prefilling the email if one was typed.
  function handleHeroSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    navigate(trimmed ? `/signup?email=${encodeURIComponent(trimmed)}` : '/signup');
  }

  return (
    <div className="lp">
      {/* ---------- Sticky nav ---------- */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" aria-label="mailverify home">
            <Logo />
          </Link>
          <nav className="lp-nav-actions">
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
            <Link to="/signup" className="btn btn-primary">
              Sign up free
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div>
            <span className="lp-pill">
              <span className="dot" />
              Real-time SMTP verification
            </span>
            <h1>
              Verify email addresses <span className="lp-grad">in real time.</span>
            </h1>
            <p className="lp-hero-sub">
              Stop bounces before they happen. mailverify checks every address against
              live mail servers so you protect your sender reputation and reach real
              inboxes.
            </p>

            <form className="lp-hero-form" onSubmit={handleHeroSubmit} noValidate>
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
            <p className="lp-trust-text">
              <strong>25 free verifications</strong> • No credit card required
            </p>
          </div>

          {/* Decorative mock result card (static — mirrors the real ResultCard look) */}
          <div className="lp-hero-visual" aria-hidden="true">
            <div className="lp-mock-card">
              <div className="lp-mock-head">
                <div>
                  <div className="lp-mock-email">jordan@company.com</div>
                  <div className="lp-mock-sub">deliverable mailbox</div>
                </div>
                <span className="lp-mock-badge">Valid</span>
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

      {/* ---------- Trust / logos strip ---------- */}
      <section className="lp-logos">
        <div className="lp-container">
          <p className="lp-logos-label">Trusted by senders who care about deliverability</p>
          <div className="lp-logos-row">
            {/* Placeholder muted logo blocks — no real brands */}
            <div className="lp-logo-block">Northwind</div>
            <div className="lp-logo-block">Acme Mail</div>
            <div className="lp-logo-block">Lumen</div>
            <div className="lp-logo-block">Outpost</div>
            <div className="lp-logo-block">Skyline</div>
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
            {FEATURES.map((f) => (
              <div className="lp-feature" key={f.title}>
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
              <div className="lp-step" key={s.title}>
                <div className="lp-step-num">{i + 1}</div>
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
            {PLANS.map((plan) => (
              <div className={`lp-price-card${plan.popular ? ' popular' : ''}`} key={plan.name}>
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
                <Link
                  to="/signup"
                  className={`btn btn-block btn-lg ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {plan.cta}
                </Link>
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
          <div className="lp-cta">
            <h2>Start verifying for free</h2>
            <p>
              Create an account in seconds and get 25 free verifications — no credit card
              required.
            </p>
            <Link to="/signup" className="btn btn-lg lp-btn-on-dark">
              Sign up free
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div>
              <Logo />
              <p className="lp-footer-tagline">
                Real-time email verification that keeps your lists clean and your sender
                reputation strong.
              </p>
            </div>
            <div className="lp-footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="#how-it-works">How it works</a></li>
                <li><a href="#faq">FAQ</a></li>
              </ul>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#">Blog</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>
            <div className="lp-footer-col">
              <h4>Legal</h4>
              <ul>
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Terms</a></li>
                <li><a href="#">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="lp-footer-bottom">
            © {new Date().getFullYear()} mailverify. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
