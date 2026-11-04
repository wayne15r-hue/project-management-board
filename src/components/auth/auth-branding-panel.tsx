import { BrandLogo } from "@/components/shared/brand-logo";

export function AuthBrandingPanel() {
  return (
    <aside className="solar-auth-story relative hidden flex-col justify-between overflow-hidden p-10 text-foreground md:flex md:w-[55%] md:flex-1 lg:p-14">
      <BrandLogo className="text-2xl font-semibold text-primary" />
      <div className="max-w-lg py-16">
        <p className="mb-5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          A shared direction
        </p>
        <h1 className="text-[42px] font-semibold leading-[1.1] tracking-tight lg:text-[48px]">
          Good work.<br />Brighter together.
        </h1>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          Plan the day, connect your team, and keep the work that matters moving.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Projects · People · Daily operations</p>
    </aside>
  );
}
