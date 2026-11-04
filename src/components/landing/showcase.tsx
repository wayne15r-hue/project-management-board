"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type KeyboardEvent,
} from "react";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function Showcase({
  labels,
  children,
}: {
  labels: string[];
  children: ReactNode[];
}) {
  const enhanced = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLAnchorElement | null)[]>([]);
  function onKey(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % labels.length;
    else if (event.key === "ArrowLeft")
      next = (index + labels.length - 1) % labels.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = labels.length - 1;
    else if (event.key === " ") {
      event.preventDefault();
      setActive(index);
      return;
    } else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }
  return (
    <>
      <div
        className="solar-tabs"
        role={enhanced ? "tablist" : undefined}
        aria-label="Explore the sample workspace"
      >
        {labels.map((label, index) => (
          <a
            key={label}
            href={`#sample-${index}`}
            id={`sample-tab-${index}`}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            role={enhanced ? "tab" : undefined}
            aria-selected={enhanced ? active === index : undefined}
            aria-controls={enhanced ? `sample-${index}` : undefined}
            tabIndex={enhanced && active !== index ? -1 : 0}
            onKeyDown={(event) => onKey(event, index)}
            onClick={(event) => {
              event.preventDefault();
              setActive(index);
            }}
          >
            {label}
          </a>
        ))}
      </div>
      {children.map((child, index) => (
        <div
          key={labels[index]}
          data-sample-panel
          id={`sample-${index}`}
          role={enhanced ? "tabpanel" : undefined}
          aria-labelledby={`sample-tab-${index}`}
          tabIndex={0}
          hidden={enhanced && active !== index}
        >
          {child}
        </div>
      ))}
      <p className="solar-sample-note">
        Sample workspace · Fictional data. Explore views only; no requests,
        approvals or calls are made.
      </p>
    </>
  );
}
