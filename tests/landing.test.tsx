// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "@/components/landing/landing-page";

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
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
