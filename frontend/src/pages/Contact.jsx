import { useState } from 'react';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import Spinner from '../components/Spinner';
import { api, ApiError } from '../api';
import '../landing.css';

/**
 * Public marketing "Contact" page (served on the marketing host, like
 * Features/Pricing). Reuses the shared MarketingNav + MarketingFooter and the
 * "lp-" landing styles.
 *
 * The form POSTs to the PUBLIC /contact endpoint (no auth). The endpoint is
 * rate-limited server-side, so we surface a friendly message on 429.
 */

const SUPPORT_EMAIL = 'support@goanglelead.com';
const WHATSAPP_NUMBER = '+8801710363553';
const WHATSAPP_URL = 'https://wa.me/8801710363553';

// Simple, permissive email shape check (mirrors the rest of the app's UX).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function IconMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 0 0 1.507 5.26l-.999 3.648 3.981-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z" />
    </svg>
  );
}

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function validate() {
    if (!name.trim()) return 'Please enter your name.';
    if (!email.trim()) return 'Please enter your email.';
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!message.trim()) return 'Please enter a message.';
    return '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      await api.contactSubmit({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      setSuccess(true);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("You're sending messages too fast — please try again in a few minutes.");
      } else {
        setError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lp">
      <MarketingNav />

      {/* ---------- Hero ---------- */}
      <section className="lp-section lp-page-hero">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Contact</span>
            <h1 className="lp-page-title">
              Get in <span className="lp-grad">touch</span>
            </h1>
            <p>Questions? Send us a message and we&apos;ll get back to you.</p>
          </div>
        </div>
      </section>

      {/* ---------- Contact options + form ---------- */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-container">
          <div className="lp-contact-grid">
            {/* Direct contact options */}
            <aside className="lp-contact-info">
              <h3>Reach us directly</h3>
              <p className="lp-contact-info-sub">
                Prefer email or chat? Use any of these and we&apos;ll respond as soon as we can.
              </p>

              <a className="lp-contact-channel" href={`mailto:${SUPPORT_EMAIL}`}>
                <span className="lp-contact-channel-icon"><IconMail /></span>
                <span>
                  <span className="lp-contact-channel-label">Email</span>
                  <span className="lp-contact-channel-value">{SUPPORT_EMAIL}</span>
                </span>
              </a>

              <a
                className="lp-contact-channel"
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="lp-contact-channel-icon"><IconWhatsApp /></span>
                <span>
                  <span className="lp-contact-channel-label">WhatsApp</span>
                  <span className="lp-contact-channel-value">{WHATSAPP_NUMBER}</span>
                </span>
              </a>
            </aside>

            {/* Form */}
            <div className="lp-contact-form-card">
              {success && (
                <div className="alert alert-success">
                  Thanks! Your message has been sent — we&apos;ll reply soon.
                </div>
              )}
              {error && <div className="alert alert-error">{error}</div>}

              <form onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label htmlFor="contact-name">Name</label>
                  <input
                    id="contact-name"
                    className="input"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="contact-email">Email</label>
                  <input
                    id="contact-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="contact-subject">
                    Subject <span className="lp-contact-optional">(optional)</span>
                  </label>
                  <input
                    id="contact-subject"
                    className="input"
                    type="text"
                    placeholder="What's this about?"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="field">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    className="input lp-contact-textarea"
                    rows={6}
                    placeholder="How can we help?"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={busy}
                    required
                  />
                </div>

                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
                  {busy ? <Spinner onDark /> : 'Send message'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
