import { AuthBrandingPanel } from "@/components/auth/auth-branding-panel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AuthBrandingPanel />
      <main className="flex min-h-screen w-full flex-1 items-center justify-center px-4 py-10 md:w-[40%] md:min-w-[420px] md:flex-none md:px-8">
        <div className="w-full max-w-[380px] auth-slide-in">{children}</div>
      </main>
    </div>
  );
}
