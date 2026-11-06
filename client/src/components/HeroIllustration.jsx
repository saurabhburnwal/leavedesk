/**
 * OWNER: Claude. Original decorative illustration for auth hero panel.
 * Scene: a person sitting/leaning on a large round clock, surrounded by
 * floating calendar & check-mark elements. Flat style, soft palette.
 * Viewbox 220×150, aria-hidden, scales via CSS.
 */
export function HeroIllustration({ className = '', style }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 220 150"
      width="220"
      height="150"
      fill="none"
      aria-hidden="true"
      role="img"
    >
      {/* ---- background glow blobs ---- */}
      <ellipse cx="110" cy="130" rx="80" ry="14" fill="rgba(99,102,241,0.12)" />

      {/* ---- large clock face ---- */}
      {/* shadow */}
      <ellipse cx="112" cy="104" rx="43" ry="6" fill="rgba(99,102,241,0.10)" />
      {/* body */}
      <circle cx="110" cy="76" r="44" fill="#ede9fe" />
      <circle cx="110" cy="76" r="44" stroke="#c4b5fd" strokeWidth="3" />
      {/* inner ring */}
      <circle cx="110" cy="76" r="37" stroke="#ddd6fe" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* clock numerals (simple dots at 12/3/6/9) */}
      <circle cx="110" cy="38" r="3" fill="#7c3aed" />
      <circle cx="148" cy="76" r="3" fill="#7c3aed" />
      <circle cx="110" cy="114" r="3" fill="#7c3aed" />
      <circle cx="72" cy="76" r="3" fill="#7c3aed" />
      {/* hour hand — pointing ~10 o'clock */}
      <line x1="110" y1="76" x2="96" y2="57" stroke="#6d28d9" strokeWidth="3.5" strokeLinecap="round" />
      {/* minute hand — pointing ~2 o'clock */}
      <line x1="110" y1="76" x2="128" y2="60" stroke="#4338ca" strokeWidth="2.5" strokeLinecap="round" />
      {/* center dot */}
      <circle cx="110" cy="76" r="4.5" fill="#7c3aed" />
      <circle cx="110" cy="76" r="2" fill="#fff" />

      {/* ---- person sitting/leaning on the clock ---- */}
      {/* body torso */}
      <rect x="62" y="80" width="22" height="28" rx="8" fill="#6366f1" />
      {/* head */}
      <circle cx="73" cy="68" r="12" fill="#fde68a" />
      {/* hair */}
      <path d="M62 65 Q73 54 84 65" fill="#92400e" />
      {/* left arm leaning on clock */}
      <path d="M62 90 Q55 90 54 100" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* right arm raised */}
      <path d="M84 88 Q94 80 97 72" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* hand holding a pencil */}
      <line x1="97" y1="72" x2="104" y2="64" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="97" cy="72" r="2.5" fill="#fde68a" />
      {/* legs */}
      <path d="M68 108 Q65 122 60 128" stroke="#4338ca" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M76 108 Q78 122 84 128" stroke="#4338ca" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* shoes */}
      <ellipse cx="58" cy="129" rx="7" ry="3.5" fill="#312e81" />
      <ellipse cx="86" cy="129" rx="7" ry="3.5" fill="#312e81" />

      {/* ---- floating mini calendar card (top-right) ---- */}
      <g transform="translate(155, 22)">
        <rect width="38" height="34" rx="8" fill="#fff" stroke="#c4b5fd" strokeWidth="1.5" />
        <rect y="0" width="38" height="11" rx="6" fill="#6366f1" />
        {/* calendar header top rounding mask */}
        <rect y="6" width="38" height="5" fill="#6366f1" />
        {/* dots = day grid */}
        <circle cx="10" cy="21" r="2.5" fill="#c4b5fd" />
        <circle cx="19" cy="21" r="2.5" fill="#6366f1" />
        <circle cx="28" cy="21" r="2.5" fill="#c4b5fd" />
        <circle cx="10" cy="29" r="2.5" fill="#c4b5fd" />
        <circle cx="19" cy="29" r="2.5" fill="#c4b5fd" />
        <circle cx="28" cy="29" r="2.5" fill="#86efac" />
      </g>

      {/* ---- floating check badge (top-left) ---- */}
      <g transform="translate(18, 30)">
        <circle cx="14" cy="14" r="14" fill="#dcfce7" stroke="#86efac" strokeWidth="1.5" />
        <polyline points="8,14 12,19 20,9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>

      {/* ---- floating yellow star accent (bottom-right) ---- */}
      <g transform="translate(176, 95)">
        <polygon
          points="12,2 14.5,9.5 22,9.5 16,14 18.5,21.5 12,17 5.5,21.5 8,14 2,9.5 9.5,9.5"
          fill="#fde68a"
          stroke="#f59e0b"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </g>

      {/* ---- small notification bubble (right of clock) ---- */}
      <g transform="translate(148, 45)">
        <rect width="28" height="18" rx="9" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="1.2" />
        <circle cx="8" cy="9" r="3" fill="#f59e0b" />
        <rect x="14" y="7.5" width="10" height="3" rx="1.5" fill="#a78bfa" />
      </g>
    </svg>
  );
}
