// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "@/components/landing/landing-page";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

it("offers a footer motion preference that survives remounting", () => {
  const first = render(<LandingPage />);
  expect(screen.queryByRole("button", { name: /pause animation/i })).toBeNull();
  const video = first.container.querySelector("video")!;
  expect(video.loop && video.muted).toBe(true);
  expect(first.container.querySelector(".solar-hero .ghost-fibers-canvas")).toBeTruthy();
  expect(video.dataset.playing).toBe("false");
  fireEvent.playing(video);
  expect(video.dataset.playing).toBe("true");
  const setting = within(screen.getByRole("contentinfo")).getByRole("checkbox", { name: "Reduce motion" }) as HTMLInputElement;
  expect(setting.checked).toBe(false);
  fireEvent.click(setting);
  expect(first.container.querySelector(".solar-page")?.getAttribute("data-reduced-motion")).toBe("true");
  expect(first.container.querySelector("video")).toBeNull();
  expect(first.container.querySelector(".ghost-fibers-canvas")).toBeNull();
  first.unmount();
  render(<LandingPage />);
  expect((screen.getByRole("checkbox", { name: "Reduce motion" }) as HTMLInputElement).checked).toBe(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("moves sample tabs with wrapping arrows and Home/End, keeping focus on selection", () => {
  render(<LandingPage />);
  const work = screen.getByRole("tab", { name: "Work" });
  work.focus();
  fireEvent.keyDown(work, { key: "ArrowLeft" });
  const people = screen.getByRole("tab", { name: "People" });
  expect(document.activeElement).toBe(people);
  expect(people.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(people, { key: "Home" });
  expect(document.activeElement).toBe(work);
  fireEvent.keyDown(work, { key: "End" });
  expect(document.activeElement).toBe(people);
  fireEvent.keyDown(people, { key: "ArrowRight" });
  expect(document.activeElement).toBe(work);
  fireEvent.click(screen.getByRole("tab", { name: "LeaveDesk" }));
  expect(screen.getByRole("tabpanel").textContent).toContain(
    "Department availability",
  );
});

it("switches previews without making private API or media requests", () => {
  const fetch = vi.fn(() => {
    throw new Error("Sample must stay local");
  });
  const capture = vi.fn(() => {
    throw new Error("Sample must not capture media");
  });
  vi.stubGlobal("fetch", fetch);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: capture, getDisplayMedia: capture },
  });
  render(<LandingPage />);
  for (const tab of screen.getAllByRole("tab")) fireEvent.click(tab);
  expect(fetch).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: /approve|join call|submit request/i }),
  ).toBeNull();
});

it("renders all six sample panels, real CTAs and content on the server without JavaScript", () => {
  const html = renderToStaticMarkup(<LandingPage />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("h1")?.textContent).toBe(
    "Bring your team’s work into focus.",
  );
  expect(doc.querySelectorAll("[data-sample-panel]").length).toBe(6);
  expect(doc.querySelectorAll("[data-sample-panel][hidden]").length).toBe(0);
  expect(doc.querySelectorAll("[data-solar-scene]").length).toBe(6);
  expect(doc.querySelector(".solar-page")?.hasAttribute("data-reduced-motion")).toBe(false);
  expect(doc.querySelector('img[src="/landing/eclipse.webp"]')?.getAttribute("alt")).toBe("");
  expect(doc.querySelector("video")).toBeNull();
  expect(doc.querySelector('a[href="/signup"]')?.textContent).toContain(
    "Create account",
  );
  expect(doc.querySelector('a[href="/login"]')).toBeTruthy();
  for (const link of doc.querySelectorAll('a[href^="#"]')) {
    expect(
      doc.getElementById(link.getAttribute("href")!.slice(1)),
    ).toBeTruthy();
  }
  expect(doc.body.textContent).not.toMatch(
    /500\+|free forever|unlimited|ProjectBoard|Watch demo/i,
  );
});
