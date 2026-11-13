"use client";

import { Children, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./BranchedMenu.css";

// Adapted from React Bits BranchedMenu-JS-CSS for native application links.
export function BranchedMenu({ children }: { children: ReactNode }) {
  return <div className="branched-menu">{children}</div>;
}

export function MenuBranch({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <div className="branched-menu__section" data-open={open || undefined}>
      <div className="branched-menu__heading">
        <button
          type="button"
          className="branched-menu__head"
          aria-controls={id}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={14} aria-hidden="true" />
          {label}
        </button>
        {action}
      </div>
      <div className="branched-menu__body" id={id} inert={!open} aria-hidden={open ? undefined : true}>
        <ul className="branched-menu__tree">
          {Children.map(children, (child) => (
            <li className="branched-menu__item">
              <svg className="branched-menu__lines" viewBox="0 0 16 12" aria-hidden="true">
                <path className="branched-menu__base" d="M 1 0 Q 1 11 12 11 H 16" />
                <path className="branched-menu__reach" pathLength="1" d="M 1 0 Q 1 11 12 11 H 16" />
              </svg>
              {child}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
