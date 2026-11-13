import Link from "next/link";
import { ArrowDown, ArrowRight, Check, ShieldCheck, Sun } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { BRAND } from "@/lib/brand";
import { EclipseHeroMedia } from "./eclipse-hero-media";
import { CHAPTERS, ProductPreview } from "./product-preview";
import { Showcase } from "./showcase";
import "./solar.css";

const FAQ = [
  [
    "Is Helios for projects or daily operations?",
    "Both. Boards and My Work support project delivery. Service Desk, approvals, LeaveDesk and people records support the work that keeps a team running.",
  ],
  [
    "How does onboarding work?",
    "Create an account and complete employee setup. Join the appropriate teams and boards using the access your organization provides. Invitation email delivery depends on the workspace email configuration.",
  ],
  [
    "Are AI, video calls and screen sharing available?",
    "Helios includes AI task creation, extraction, writing assistance and summaries, plus direct and group calls with video and shared screens. Availability depends on workspace configuration, service credentials, feature settings and browser support. Incoming calls require an open, signed-in dashboard.",
  ],
  [
    "What can my department see in LeaveDesk?",
    "Department calendar access helps teammates see availability. Medical attachments and sensitive absence records have restricted access; they are not part of an ordinary coworker calendar view.",
  ],
  [
    "Who can access my workspace?",
    "Sign-in and employee setup are required. Team membership, board access and administrative roles determine what each person can see and manage. An account does not grant access to every team or record.",
  ],
] as const;

function NavLinks() {
  return (
    <>
      <a href="#product">Product</a>
      <a href="#how-it-works">How it works</a>
      <a href="#faq">FAQ</a>
      <Link href="/login">Sign in</Link>
      <Link className="solar-button solar-button-small" href="/signup">
        Create account <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </>
  );
}

export function LandingPage() {
  return (
    <div className="solar-page">
      <a className="solar-skip" href="#main">
        Skip to content
      </a>
      <header className="solar-nav">
        <div className="solar-container solar-nav-inner">
          <Link href="/" aria-label="Helios home" className="solar-brand">
            <BrandLogo />
          </Link>
          <nav className="solar-desktop-nav" aria-label="Main navigation">
            <NavLinks />
          </nav>
          <details className="solar-mobile-nav">
            <summary>
              Menu <span aria-hidden="true">☰</span>
            </summary>
            <nav aria-label="Mobile navigation">
              <NavLinks />
            </nav>
          </details>
        </div>
      </header>
      <main id="main">
        <section
          className="solar-hero"
          aria-labelledby="hero-heading"
        >
          <EclipseHeroMedia />
          <div className="solar-hero-shade" aria-hidden="true" />
          <div className="solar-container solar-hero-inner">
            <div className="solar-hero-copy">
              <h1 id="hero-heading">
                <span>Bring your team’s</span>{" "}
                <span>work <span>into focus.</span></span>
              </h1>
              <p className="solar-hero-description">
                Plan projects, manage approvals and requests, track leave, and
                collaborate in one connected workspace.
              </p>
              <div className="solar-actions">
                <Link className="solar-button" href="/signup">
                  Create account <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a className="solar-link-button" href="#product">
                  Explore Helios <ArrowDown size={17} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </section>
        <section
          className="solar-section solar-container"
          id="product"
          aria-labelledby="product-heading"
        >
          <div className="solar-section-heading">
            <h2 id="product-heading">Explore the Helios workspace</h2>
            <p>
              See how projects, requests, and team operations fit together.
            </p>
          </div>
          <Showcase labels={CHAPTERS.map((chapter) => chapter.label)}>
            {CHAPTERS.map((chapter, index) => (
              <ProductPreview key={chapter.label} index={index} />
            ))}
          </Showcase>
        </section>
        <div className="solar-chapters solar-container">
          {CHAPTERS.map((chapter, index) => (
            <section
              key={chapter.label}
              className={`solar-chapter ${index % 2 ? "solar-chapter-reverse" : ""}`}
              aria-labelledby={`chapter-${index}`}
            >
              <div className="solar-chapter-copy">
                <p className="solar-eyebrow">{chapter.label}</p>
                <h2 id={`chapter-${index}`}>{chapter.title}</h2>
                <p>{chapter.description}</p>
                <div className="solar-chapter-detail">{chapter.detail}</div>
              </div>
              <div className="solar-chapter-preview">
                <ProductPreview index={index} compact />
              </div>
            </section>
          ))}
        </div>
        <section id="how-it-works" className="solar-section solar-how">
          <div className="solar-container">
            <div className="solar-section-heading">
              <h2>How Helios works</h2>
            </div>
            <ol className="solar-steps">
              {[
                ["Settle in", "Create an account and complete employee setup."],
                [
                  "Bring the work together",
                  "Organize work and bring teammates into the appropriate teams.",
                ],
                [
                  "Move forward, together",
                  "Manage delivery, requests, availability and collaboration.",
                ],
              ].map(([title, text], index) => (
                <li key={title}>
                  <span>0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section
          className="solar-section solar-container solar-control"
          aria-labelledby="control-heading"
        >
          <div>
            <ShieldCheck size={30} aria-hidden="true" />
            <h2 id="control-heading">Access and approvals</h2>
          </div>
          <div className="solar-control-list">
            {[
              [
                "The right people, in the right places",
                "Team and board access help keep conversations and work within their intended groups.",
              ],
              [
                "A clear second pair of eyes",
                "Independent approvals keep review separate from ownership. Notifications help the next person know when it is their turn.",
              ],
              [
                "Context you can account for",
                "Private attachments and change history support responsible handoffs, with access shaped by the workflow and your role.",
              ],
            ].map(([title, text]) => (
              <div key={title}>
                <Check size={18} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section
          id="faq"
          className="solar-section solar-container solar-faq"
          aria-labelledby="faq-heading"
        >
          <div>
            <h2 id="faq-heading">Frequently asked questions</h2>
          </div>
          <div>
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="solar-closing solar-container">
          <Sun size={34} aria-hidden="true" />
          <h2>Get started with Helios</h2>
          <div className="solar-actions">
            <Link href="/signup" className="solar-button">
              Create account <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/login" className="solar-link-button">
              Sign in <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="solar-footer solar-container">
        <div>
          <Link href="/" className="solar-brand">
            <BrandLogo />
          </Link>
          <p>{BRAND.description}</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#product">Product</a>
          <a href="#faq">FAQ</a>
          <Link href="/login">Sign in</Link>
        </nav>
        <small>
          © {new Date().getFullYear()} {BRAND.name}
        </small>
      </footer>
    </div>
  );
}
