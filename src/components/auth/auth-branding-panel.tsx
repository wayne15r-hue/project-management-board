"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "Finally, a project tool that doesn't get in the way.",
    name: "Product Team",
  },
  {
    quote: "Replaced Monday.com for our startup. Love the dark mode!",
    name: "Design Team",
  },
  {
    quote: "The timeline view changed how we plan sprints.",
    name: "Engineering Team",
  },
];

const FEATURES = [
  "Unlimited boards",
  "Real-time collaboration",
  "Free forever",
];

export function AuthBrandingPanel() {
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [featureIdx, setFeatureIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTestimonialIdx((i) => (i + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setFeatureIdx((i) => (i + 1) % FEATURES.length);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  const testimonial = TESTIMONIALS[testimonialIdx];
  const feature = FEATURES[featureIdx];

  return (
    <aside className="auth-gradient relative hidden flex-col justify-between overflow-hidden p-10 text-white md:flex md:w-[60%] md:flex-1 lg:p-14">
      {/* Floating shapes */}
      <div
        className="float-shape pointer-events-none absolute h-64 w-64 rounded-full bg-white/10 blur-2xl"
        style={{ top: "10%", left: "8%", animationDelay: "0s" }}
      />
      <div
        className="float-shape pointer-events-none absolute h-48 w-48 rounded-3xl bg-white/10 blur-2xl"
        style={{ top: "55%", left: "55%", animationDelay: "-6s" }}
      />
      <div
        className="float-shape pointer-events-none absolute h-40 w-40 rounded-full bg-white/10 blur-2xl"
        style={{ top: "75%", left: "15%", animationDelay: "-12s" }}
      />

      {/* Logo + name */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <span className="text-[20px] font-semibold tracking-tight">
          ProjectBoard
        </span>
      </div>

      {/* Headline */}
      <div className="relative z-10 max-w-lg">
        <h1 className="text-[42px] font-bold leading-[1.1] tracking-tight lg:text-[48px]">
          Where teams build
          <br />
          amazing things together.
        </h1>
        <p className="mt-4 text-[15px] text-white/80">
          Kanban, timelines, custom fields, and a whole lot of delight.
        </p>

        {/* Feature pill */}
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
          <span className="text-[13px] text-white/80">✓</span>
          <span
            key={featureIdx}
            className="text-[13px] font-medium auth-slide-in"
          >
            {feature}
          </span>
        </div>
      </div>

      {/* Testimonial */}
      <div className="relative z-10 min-h-[128px] max-w-md rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md">
        <div key={testimonialIdx} className="auth-slide-in">
          <svg
            viewBox="0 0 24 24"
            className="mb-3 h-6 w-6 text-white/50"
            fill="currentColor"
          >
            <path d="M6 11c0-3.3 2.7-6 6-6v2c-2.2 0-4 1.8-4 4h4v8H6v-8zm10 0c0-3.3 2.7-6 6-6v2c-2.2 0-4 1.8-4 4h4v8h-6v-8z" />
          </svg>
          <p className="text-[16px] font-medium leading-snug">
            &ldquo;{testimonial.quote}&rdquo;
          </p>
          <p className="mt-3 text-[12px] uppercase tracking-wider text-white/70">
            — {testimonial.name}
          </p>
        </div>
        {/* dots */}
        <div className="mt-4 flex gap-1.5">
          {TESTIMONIALS.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === testimonialIdx ? "w-6 bg-white" : "w-1 bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
