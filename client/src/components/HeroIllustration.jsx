/**
 * OWNER: Antigravity. Original decorative SVG for the dashboard greeting card
 * (e.g. a person with a calendar/clock). Placeholder until replaced.
 * Props: className. Must be decorative (aria-hidden) and use CSS variables or soft fixed colors.
 */
export function HeroIllustration({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 200 140" width="200" height="140" aria-hidden="true">
      <circle cx="120" cy="70" r="52" fill="var(--primary-soft)" />
      <rect x="78" y="40" width="84" height="64" rx="10" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <rect x="78" y="40" width="84" height="16" rx="8" fill="var(--primary)" />
      <circle cx="102" cy="76" r="5" fill="var(--pending-dot)" />
      <circle cx="120" cy="76" r="5" fill="var(--approved-dot)" />
      <circle cx="138" cy="76" r="5" fill="var(--info-dot)" />
    </svg>
  );
}
