import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import '../landing.css';

/**
 * Public marketing "Features" page (served on the marketing host, like Landing).
 * Reuses the shared MarketingNav + MarketingFooter and the "lp-" landing styles.
 *
 * Auth CTAs link to the app host (auth lives on app.goanglelead.com), matching
 * the rest of the marketing site.
 */

const APP_URL = 'https://app.goanglelead.com';

/* ---------- Inline SVG icons (no external icon dependency) ---------- */

function IconMail() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}
function IconLayers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 2 9 5-9 5-9-5 9-5z" />
      <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}
function IconBraces() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
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
function IconPlug() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22v-5M9 7V2M15 7V2M6 13a6 6 0 0 0 12 0V7H6v6z" />
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
function IconCode() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  );
}
function IconCoins() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: <IconMail />,
    title: 'Single email verification',
    desc: 'Check any address instantly from your dashboard or the API and get a clear status with a confidence score.',
  },
  {
    icon: <IconLayers />,
    title: 'Bulk verification',
    desc: 'Upload a CSV with up to 50,000 addresses, let us process the whole list, and download clean, deliverable results.',
  },
  {
    icon: <IconBraces />,
    title: 'Syntax & format checks',
    desc: 'Catch typos and malformed addresses up front so obvious bad data never reaches your sending platform.',
  },
  {
    icon: <IconServer />,
    title: 'MX & domain checks',
    desc: "Confirm the domain exists and has valid mail (MX) records, so you only keep addresses that can actually receive email.",
  },
  {
    icon: <IconNet />,
    title: 'SMTP mailbox verification',
    desc: 'We connect to the mail server in real time to confirm the mailbox exists — without ever sending a test email.',
  },
  {
    icon: <IconNet />,
    title: 'Catch-all detection',
    desc: 'Spot domains that accept every address so you can score those sends by risk instead of trusting them blindly.',
  },
  {
    icon: <IconTrash />,
    title: 'Disposable email detection',
    desc: 'Flag throwaway and temporary inboxes before they inflate your list and hurt your engagement metrics.',
  },
  {
    icon: <IconUser />,
    title: 'Role-based address detection',
    desc: 'Identify shared addresses like info@ and support@ that tend to lower deliverability and reply rates.',
  },
  {
    icon: <IconCode />,
    title: 'REST API with API keys',
    desc: 'Verify single addresses or run bulk checks programmatically with a clean, documented API and per-key access.',
  },
  {
    icon: <IconCoins />,
    title: 'Credit system',
    desc: 'Pay only for what you verify. Credits never expire, so you can top up once and use them whenever you need.',
  },
];

export default function Features() {
  return (
    <div className="lp">
      <MarketingNav />

      {/* ---------- Hero ---------- */}
      <section className="lp-section lp-page-hero">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Features</span>
            <h1 className="lp-page-title">
              Powerful email verification <span className="lp-grad">features</span>
            </h1>
            <p>
              Everything you need to clean your lists, protect your sender reputation,
              and reach real inboxes — in a simple dashboard and a developer-friendly API.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Feature grid ---------- */}
      <section
        className="lp-section"
        style={{ paddingTop: 0 }}
      >
        <div className="lp-container">
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

      {/* ---------- CTA ---------- */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-container">
          <div className="lp-cta">
            <h2>Start verifying free</h2>
            <p>
              Create an account in seconds and get 25 free credits — no credit card
              required.
            </p>
            <a href={`${APP_URL}/signup`} className="btn btn-lg lp-btn-on-dark">
              Start verifying free — 25 free credits
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
