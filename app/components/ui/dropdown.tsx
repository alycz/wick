"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/* Wick's dropdown: a button that opens a listbox in the platform style instead of the system menu.
   The menu grows from the trigger on a short spring-like ease, items stagger in, the active row follows the
   pointer and the keyboard, and the chosen row carries a check. */

export interface DropdownOption<T extends string> {
  value: T;
  label: ReactNode;
  /** muted text on the right of the row, such as a price or a percentage */
  hint?: ReactNode;
  /** a second line under the label */
  sub?: ReactNode;
  /** plain text used for the accessible name when label is not a string */
  text?: string;
}

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Dropdown<T extends string>({ value, options, onChange, label, prefix, className = "", align = "left", menuWidth }: {
  value: T;
  options: Array<DropdownOption<T>>;
  onChange: (value: T) => void;
  /** accessible name of the control */
  label: string;
  /** small muted label shown inside the trigger, before the value ("Strike") */
  prefix?: ReactNode;
  className?: string;
  align?: "left" | "right";
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  const close = useCallback((focus = true) => {
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); }, 140);
    if (focus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) close(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  useIsoLayout(() => {
    if (!open || !list.current) return;
    const row = list.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!row) return;
    const box = list.current;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop - 6;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 6;
  }, [open, active]);

  const show = () => { setActive(selectedIndex); setClosing(false); setOpen(true); };
  const pick = (index: number) => { const option = options[index]; if (option) onChange(option.value); close(); };
  const onKey = (event: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); show(); }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last, PageDown: Math.min(last, active + 6), PageUp: Math.max(0, active - 6) };
    if (event.key in moves) { event.preventDefault(); setActive(moves[event.key]!); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(active); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") close(false);
  };

  return <div ref={host} className={`dd ${className}${open ? " open" : ""}`} onKeyDown={onKey}>
    <button ref={trigger} type="button" role="combobox" className="dd-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={label} data-value={value}
      onClick={() => (open ? close() : show())}>
      {prefix ? <span className="dd-pre">{prefix}</span> : null}
      <span className="dd-val">{selected?.label}</span>
      <svg className="dd-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div ref={list} id={id} role="listbox" aria-label={label} tabIndex={-1}
      className={`dd-menu ${align === "right" ? "dd-right" : ""}${closing ? " out" : ""}`} style={menuWidth ? { width: menuWidth } : undefined}
      aria-activedescendant={`${id}-${active}`}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" data-index={index} data-value={option.value}
        aria-selected={option.value === value} className={`dd-opt${index === active ? " act" : ""}`}
        style={{ animationDelay: `${Math.min(index, 10) * 14}ms` }}
        onPointerMove={() => { if (index !== active) setActive(index); }}
        onClick={() => pick(index)}>
        <span className="dd-txt"><span className="dd-l">{option.label}</span>{option.sub ? <small>{option.sub}</small> : null}</span>
        {option.hint !== undefined ? <span className="dd-hint">{option.hint}</span> : null}
        <svg className="dd-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>)}
    </div>}
  </div>;
}
