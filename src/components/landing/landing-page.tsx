"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Columns3,
  Table2,
  GanttChart,
  Zap,
  Moon,
  LayoutTemplate,
  Check,
  X,
  ArrowRight,
  LayoutDashboard,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Intersection Observer hook for fade-in ─────────────────────────────────

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("opacity-100", "translate-y-0");
            entry.target.classList.remove("opacity-0", "translate-y-6");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function FadeIn({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return (
    <div
      ref={ref}
      className={`opacity-0 translate-y-6 transition-all duration-700 ease-out ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-200 ${
        scrolled
          ? "border-b border-border bg-background/85 backdrop-blur-md shadow-sm"
          : "border-b border-transparent bg-background/40 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <span className="text-[16px] font-bold text-foreground">ProjectBoard</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <a
            href="#features"
            className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Pricing
          </a>
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Sign in
          </Link>
          <Link href="/signup" className="ml-2">
            <Button
              size="sm"
              className="bg-foreground text-background text-[13px] hover:bg-foreground/90"
            >
              Get Started Free
            </Button>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            <a
              href="#features"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-[14px] text-foreground hover:bg-accent"
            >
              Features
            </a>
            <a
              href="#pricing"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-[14px] text-foreground hover:bg-accent"
            >
              Pricing
            </a>
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-[14px] text-foreground hover:bg-accent"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={() => setMenuOpen(false)}
              className="rounded-md bg-foreground px-3 py-2 text-center text-[14px] font-semibold text-background"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-gradient-to-br from-indigo-500/10 via-purple-500/8 to-transparent blur-3xl dark:from-indigo-500/5 dark:via-purple-500/4" />
      </div>

      <div className="mx-auto max-w-4xl px-6 text-center">
        <FadeIn>
          <h1 className="text-[clamp(32px,5vw,56px)] font-extrabold leading-[1.1] tracking-tight text-foreground">
            Project management that{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              gets out of your way
            </span>
          </h1>
        </FadeIn>

        <FadeIn>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground sm:text-[18px]">
            A beautiful, fast, and free alternative to Monday.com and Notion.
            Organize your work with Kanban boards, table views, and timeline charts.
          </p>
        </FadeIn>

        <FadeIn>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button className="h-11 bg-foreground px-7 text-[14px] font-semibold text-background hover:bg-foreground/90">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="outline" className="h-11 px-7 text-[14px]">
                Watch demo
              </Button>
            </a>
          </div>
        </FadeIn>

        <FadeIn>
          <p className="mt-4 text-[12px] text-muted-foreground">
            No credit card required · Unlimited boards · Unlimited users
          </p>
        </FadeIn>

        {/* App mockup */}
        <FadeIn className="mt-14">
          <div className="relative mx-auto max-w-3xl">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl dark:shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
                <span className="h-3 w-3 rounded-full bg-[#27C93F]" />
                <span className="ml-4 text-[11px] text-muted-foreground">ProjectBoard — Sprint Board</span>
              </div>
              {/* Kanban mockup */}
              <div className="flex gap-3 overflow-hidden p-5">
                {[
                  { name: "To Do", color: "#6366f1", cards: ["Design landing page", "API integration", "Write tests"] },
                  { name: "In Progress", color: "#f59e0b", cards: ["User auth flow", "Dashboard UI"] },
                  { name: "Done", color: "#22c55e", cards: ["Database schema", "CI/CD setup", "Project init"] },
                ].map((col) => (
                  <div key={col.name} className="flex-1 rounded-lg bg-muted/60 p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 px-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                      <span className="text-[11px] font-semibold text-foreground">{col.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{col.cards.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {col.cards.map((card) => (
                        <div
                          key={card}
                          className="rounded-md border border-border bg-card px-3 py-2 text-[11px] font-medium text-foreground shadow-sm"
                        >
                          {card}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Glow effect */}
            <div className="pointer-events-none absolute -inset-4 -z-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent blur-2xl dark:from-indigo-500/10 dark:via-purple-500/5" />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Features ───────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Columns3,
    title: "Kanban Boards",
    desc: "Drag-and-drop cards across customizable columns. See your workflow at a glance.",
    color: "#6366f1",
  },
  {
    icon: Table2,
    title: "Table View",
    desc: "Spreadsheet-style view for data-driven teams. Sort, filter, and analyze.",
    color: "#3b82f6",
  },
  {
    icon: GanttChart,
    title: "Timeline",
    desc: "Gantt charts to visualize project timelines and deadlines at every zoom level.",
    color: "#8b5cf6",
  },
  {
    icon: Zap,
    title: "Real-time",
    desc: "See changes instantly as your team collaborates. No refresh needed.",
    color: "#f59e0b",
  },
  {
    icon: Moon,
    title: "Dark Mode",
    desc: "Easy on the eyes with a beautiful dark theme that adapts to your system.",
    color: "#06b6d4",
  },
  {
    icon: LayoutTemplate,
    title: "Templates",
    desc: "Start fast with pre-built board templates for sprints, marketing, and more.",
    color: "#22c55e",
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-500">Features</p>
            <h2 className="mt-2 text-[28px] font-bold text-foreground sm:text-[36px]">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] text-muted-foreground">
              A focused set of tools that help you ship faster without the bloat of enterprise project managers.
            </p>
          </div>
        </FadeIn>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FadeIn key={f.title} className={`delay-[${i * 60}ms]`}>
              <div className="group h-full rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-border/80 hover:shadow-lg dark:hover:shadow-xl">
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${f.color}15` }}
                >
                  <f.icon className="h-5 w-5" style={{ color: f.color }} />
                </div>
                <h3 className="text-[16px] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Comparison ─────────────────────────────────────────────────────────────

const COMPARISON_ROWS = [
  { feature: "Unlimited boards", us: true, monday: false, trello: "10" },
  { feature: "Unlimited users", us: true, monday: "2", trello: true },
  { feature: "Kanban boards", us: true, monday: true, trello: true },
  { feature: "Table view", us: true, monday: true, trello: false },
  { feature: "Timeline / Gantt", us: true, monday: false, trello: false },
  { feature: "Dark mode", us: true, monday: false, trello: false },
  { feature: "Board templates", us: true, monday: true, trello: true },
  { feature: "Subtasks", us: true, monday: false, trello: true },
  { feature: "File attachments", us: true, monday: false, trello: true },
  { feature: "Custom labels", us: true, monday: true, trello: true },
];

function CellIcon({ val }: { val: boolean | string }) {
  if (val === true)
    return <Check className="mx-auto h-4 w-4 text-green-500" />;
  if (val === false)
    return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-[12px] text-muted-foreground">{val}</span>;
}

function Comparison() {
  return (
    <section className="bg-muted/40 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <FadeIn>
          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-500">
              Compare
            </p>
            <h2 className="mt-2 text-[28px] font-bold text-foreground sm:text-[36px]">
              More features, zero cost
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] text-muted-foreground">
              See how ProjectBoard stacks up against popular free plans.
            </p>
          </div>
        </FadeIn>

        <FadeIn>
          <div className="mt-12 overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-5 py-3 text-left font-semibold text-foreground">Feature</th>
                  <th className="px-3 py-3 text-center font-semibold text-indigo-500">
                    ProjectBoard
                  </th>
                  <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                    Monday.com<br />
                    <span className="text-[10px] font-normal">Free</span>
                  </th>
                  <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                    Trello<br />
                    <span className="text-[10px] font-normal">Free</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-foreground">{row.feature}</td>
                    <td className="px-3 py-2.5 text-center">
                      <CellIcon val={row.us} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <CellIcon val={row.monday} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <CellIcon val={row.trello} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Social proof ───────────────────────────────────────────────────────────

function SocialProof() {
  const logos = [
    { name: "TechCorp", className: "font-extrabold tracking-tight" },
    { name: "DesignStudio", className: "font-light italic tracking-wide" },
    { name: "StartupXYZ", className: "font-bold uppercase tracking-widest" },
    { name: "Northwind", className: "font-serif font-semibold" },
    { name: "Acme Co.", className: "font-mono font-medium" },
  ];
  return (
    <section className="border-y border-border bg-muted/30 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Join 500+ teams managing projects better
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-muted-foreground/70">
            {logos.map((l) => (
              <span
                key={l.name}
                className={`text-[16px] sm:text-[18px] ${l.className}`}
              >
                {l.name}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── How it works ───────────────────────────────────────────────────────────

const STEPS = [
  {
    title: "Create a board",
    desc: "Pick a template or start blank. Your workspace is ready in seconds.",
  },
  {
    title: "Add your team",
    desc: "Invite teammates with just their email. They'll be collaborating in minutes.",
  },
  {
    title: "Get things done",
    desc: "Drag cards, set priorities, track progress. It's that simple.",
  },
];

function HowItWorks() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-500">
              How it works
            </p>
            <h2 className="mt-2 text-[28px] font-bold text-foreground sm:text-[36px]">
              Up and running in three steps
            </h2>
          </div>
        </FadeIn>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <FadeIn key={s.title}>
              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-[14px] font-bold text-white shadow-md">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-[16px] font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ───────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: "ProjectBoard replaced 3 tools for us. The timeline view alone is worth it.",
    name: "Sarah K.",
    role: "Product Manager",
    initials: "SK",
    color: "#7CAFC4",
  },
  {
    quote: "Finally a free tool that doesn't feel free. The dark mode is gorgeous.",
    name: "James L.",
    role: "Designer",
    initials: "JL",
    color: "#9B8FBF",
  },
  {
    quote: "We switched from Monday.com and saved $500/month. No regrets.",
    name: "Priya R.",
    role: "Startup Founder",
    initials: "PR",
    color: "#E8A87C",
  },
];

function Testimonials() {
  return (
    <section className="bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-500">
              Loved by teams
            </p>
            <h2 className="mt-2 text-[28px] font-bold text-foreground sm:text-[36px]">
              Don&apos;t take our word for it
            </h2>
          </div>
        </FadeIn>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <FadeIn key={t.name}>
              <div className="h-full rounded-xl border border-border bg-card p-6">
                <p className="text-[14px] leading-relaxed text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                    style={{ backgroundColor: t.color }}
                  >
                    {t.initials}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section id="pricing" className="bg-zinc-950 py-20 text-white sm:py-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <FadeIn>
          <h2 className="text-[28px] font-bold sm:text-[36px]">
            Ready to get your team organized?
          </h2>
          <p className="mt-3 text-[16px] text-white/70">
            Start for free today. No credit card. No limits. No catch.
          </p>
          <Link href="/signup" className="mt-8 inline-block">
            <Button className="h-12 bg-white px-8 text-[15px] font-semibold text-zinc-900 hover:bg-white/90">
              Create Free Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-5 text-[13px] text-white/60">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-white underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Templates", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

function Footer() {
  return (
    <footer className="border-t border-border bg-background py-14">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <span className="text-[14px] font-semibold text-foreground">
                ProjectBoard
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Project management for teams that ship.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {col.title}
              </p>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13px] text-muted-foreground hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-[12px] text-muted-foreground">
            © 2026 ProjectBoard. Made with{" "}
            <span className="text-rose-500">♥</span> for teams everywhere.
          </p>
          <div className="flex items-center gap-3 text-muted-foreground">
            {["X", "in", "GH"].map((s) => (
              <a
                key={s}
                href="#"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-[10px] font-semibold hover:bg-accent hover:text-foreground"
                aria-label={s}
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Landing Page ───────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Comparison />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  );
}
