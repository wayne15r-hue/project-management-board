import { BrandLogo } from "@/components/shared/brand-logo";

export function AuthBrandingPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-muted p-10 text-foreground md:flex md:w-[60%] md:flex-1 lg:p-14">
      <BrandLogo className="text-xl font-semibold" />
      <div className="max-w-lg py-16">
        <p className="mb-5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Projects · People · Daily operations
        </p>
        <h1 className="text-[42px] font-semibold leading-[1.1] tracking-tight lg:text-[48px]">
          Bring your team’s work into focus.
        </h1>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          A connected place to plan work, make decisions and keep your team
          moving.
        </p>
      </div>
      <div className="max-w-md rounded-2xl border border-border bg-background p-6">
        <p className="font-medium">A shared direction for the day ahead.</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          From project boards and approvals to requests, availability and
          conversations, keep the everyday work in context.
        </p>
      </div>
    </aside>
  );
}
