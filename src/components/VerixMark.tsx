interface VerixMarkProps {
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
  showWordmark?: boolean;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

export default function VerixMark({
  size = "md",
  inverted = false,
  showWordmark = true,
}: VerixMarkProps) {
  return (
    <div className="flex items-center gap-2">
      <svg
        className={sizeClasses[size]}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="vm-lg" x1="48" y1="40" x2="100" y2="156" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A78BFA"/>
            <stop offset="100%" stopColor="#7C3AED"/>
          </linearGradient>
          <linearGradient id="vm-rg" x1="152" y1="40" x2="100" y2="156" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#67E8F9"/>
            <stop offset="100%" stopColor="#0891B2"/>
          </linearGradient>
          <radialGradient id="vm-glow" cx="50%" cy="80%" r="45%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#0A0E1A" stopOpacity="0"/>
          </radialGradient>
        </defs>

        <rect width="200" height="200" rx="28" fill={inverted ? "#F8FAFC" : "#0A0E1A"}/>
        {!inverted && <rect width="200" height="200" rx="28" fill="url(#vm-glow)"/>}

        {/* Left arm: tips at (48,40) and (100,156) */}
        <ellipse cx="74" cy="98" rx="11" ry="63.55"
          transform="rotate(-24.2, 74, 98)"
          fill="url(#vm-lg)"/>

        {/* Right arm: tips at (152,40) and (100,156) */}
        <ellipse cx="126" cy="98" rx="11" ry="63.55"
          transform="rotate(24.2, 126, 98)"
          fill="url(#vm-rg)"/>
      </svg>

      {showWordmark && (
        <div className="leading-none">
          <div
            className={`text-sm font-semibold tracking-tight ${
              inverted ? "text-white" : "text-ink"
            }`}
          >
            Verix
          </div>
          <div
            className={`mt-1 text-[9px] uppercase tracking-[0.16em] ${
              inverted ? "text-white/35" : "text-ink-muted"
            }`}
          >
            Execution OS
          </div>
        </div>
      )}
    </div>
  );
}
