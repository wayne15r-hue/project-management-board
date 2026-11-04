import { AuthBrandingPanel } from "@/components/auth/auth-branding-panel";
import { BrandLogo } from "@/components/shared/brand-logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AuthBrandingPanel />
      <main className="flex min-h-screen w-full flex-1 items-center justify-center px-4 py-10 md:w-[40%] md:min-w-[420px] md:flex-none md:px-8">
        <div className="w-full max-w-[380px]">
          <Link href="/" className="mb-10 inline-flex min-h-11 items-center text-xl font-semibold md:hidden" aria-label="Helios home"><BrandLogo /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
