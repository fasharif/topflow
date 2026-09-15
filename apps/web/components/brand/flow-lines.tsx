/** Decorative flowing lines behind hero panels. Colour comes from `currentColor`. */
export function FlowLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 640" preserveAspectRatio="none" fill="none" className={className} aria-hidden="true">
      {Array.from({ length: 11 }, (_, i) => (
        <path
          key={i}
          d={`M-40 ${590 - i * 16} C 260 ${470 - i * 28}, 560 ${660 - i * 20}, 1240 ${150 + i * 24}`}
          stroke="currentColor"
          strokeWidth="1"
          opacity={Math.max(0.05, 0.22 - i * 0.015)}
        />
      ))}
    </svg>
  );
}
