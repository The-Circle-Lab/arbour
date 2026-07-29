export function ArbourLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {/* Trunk */}
      <rect x="18" y="24" width="4" height="12" rx="2" fill="#7B4F2E" />
      {/* Main canopy */}
      <circle cx="20" cy="18" r="10" fill="#22C55E" />
      {/* Side leaves */}
      <circle cx="11" cy="22" r="6" fill="#22C55E" />
      <circle cx="29" cy="22" r="6" fill="#22C55E" />
      {/* Highlight */}
      <circle cx="16" cy="14" r="3" fill="#4ADE80" opacity="0.5" />
    </svg>
  )
}
