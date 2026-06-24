/**
 * Small CSS spinner. `onDark` switches to a light variant for use inside
 * primary (filled) buttons.
 */
export default function Spinner({ size = 16, onDark = false }) {
  return (
    <span
      className={`spinner${onDark ? ' on-dark' : ''}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="loading"
    />
  );
}
