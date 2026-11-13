import { AuthBrandingPanel } from "@/components/auth/auth-branding-panel";
import { BrandLogo } from "@/components/shared/brand-logo";
import Link from "next/link";
import "./auth.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="solar-auth">
      <main className="solar-auth-main">
        <div className="solar-auth-panel">
          <Link href="/" className="solar-auth-home" aria-label="Helios home">
            <BrandLogo />
          </Link>
          {children}
        </div>
      </main>
      <AuthBrandingPanel />
    </div>
  );
}
