import Image from "next/image";

interface VerixMarkProps {
  size?: "sm" | "md" | "lg";
  /** Kept for API compatibility; the logo PNG is transparent, so it sits on
   *  both light and dark surfaces without needing inversion. */
  inverted?: boolean;
  /** Kept for API compatibility — the wordmark is baked into the logo image. */
  showWordmark?: boolean;
}

// Rendered logo heights per size. logo-mark.png is tightly cropped (no padding),
// so these map directly to the visible logo height.
const sizeHeights = {
  sm: 20,
  md: 26,
  lg: 32,
};

export default function VerixMark({ size = "md" }: VerixMarkProps) {
  const h = sizeHeights[size];
  return (
    <Image
      src="/logo-mark.png"
      alt="Verix"
      width={976}
      height={344}
      priority
      style={{ height: h, width: "auto", objectFit: "contain", display: "block" }}
    />
  );
}
