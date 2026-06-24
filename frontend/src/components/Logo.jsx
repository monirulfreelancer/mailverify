/**
 * Wordmark: a gradient "M" mark + "mailverify" (with the "verify" accented).
 */
export default function Logo({ showText = true }) {
  return (
    <span className="logo">
      <span className="logo-mark">✓</span>
      {showText && (
        <span className="logo-text">
          mail<span className="logo-accent">verify</span>
        </span>
      )}
    </span>
  );
}
