import Link from "next/link";
import VerixMark from "@/components/VerixMark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="vc-root flex flex-col">
      <div className="vc-mesh" aria-hidden />
      <div className="vc-grid" aria-hidden />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center">
          <VerixMark size="sm" inverted />
        </Link>
        <span className="vc-label">Developer Console</span>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}
