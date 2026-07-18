/** The Ihy mark: the sistrum of the god of music, its rattle bars doubling
 *  as equalizer bars. Monochrome via currentColor so it follows the theme. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="36 34 128 152"
      className={`app-logo ${className ?? ""}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M62,118 L62,86 A38,42 0 0 1 138,86 L138,118"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <rect x="72" y="113" width="56" height="13" rx="5" fill="currentColor" />
      <rect x="91" y="126" width="18" height="46" rx="7" fill="currentColor" />
      <rect x="84" y="168" width="32" height="11" rx="5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity="0.85">
        <line x1="60" y1="66" x2="140" y2="66" />
        <line x1="50" y1="88" x2="150" y2="88" />
        <line x1="70" y1="108" x2="130" y2="108" />
      </g>
      <g fill="currentColor">
        <circle cx="60" cy="66" r="6" />
        <circle cx="140" cy="66" r="6" />
        <circle cx="50" cy="88" r="6" />
        <circle cx="150" cy="88" r="6" />
        <circle cx="70" cy="108" r="6" />
        <circle cx="130" cy="108" r="6" />
      </g>
    </svg>
  );
}
