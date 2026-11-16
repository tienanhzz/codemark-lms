'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

type PageSearchItem = { id: string; label: string; icon: string; href: string };

export function PageSearch({ items, label, noMatches }: {
  items: PageSearchItem[];
  label: string;
  noMatches: string;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = items.filter((item) => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const activeId = open && results[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', shortcut);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('keydown', shortcut);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  return <div className="page-search" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="page-search-field">
      <i aria-hidden="true" className="fa-solid fa-magnifying-glass" />
      <input
        ref={input}
        role="combobox"
        type="text"
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId}
        value={query}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => results.length === 0 ? -1 : event.key === 'ArrowDown'
              ? (current + 1) % results.length
              : current <= 0 ? results.length - 1 : current - 1);
          } else if (event.key === 'Enter' && open && results[activeIndex]) {
            event.preventDefault();
            setOpen(false);
            router.push(results[activeIndex].href);
          }
        }}
      />
      <kbd aria-hidden="true">Ctrl K</kbd>
    </div>
    {open && <div className="page-search-dropdown">
      <div id={listId} role="listbox" aria-label={label} className="page-search-results">
        {results.map((item, index) => <Link
          key={item.id}
          id={`${listId}-${index}`}
          href={item.href}
          role="option"
          aria-selected={index === activeIndex}
          tabIndex={-1}
          onPointerMove={() => setActiveIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen(false)}
        >
          <i aria-hidden="true" className={`fa-solid ${item.icon}`} />
          <span>{item.label}</span>
          <i aria-hidden="true" className="fa-solid fa-arrow-right" />
        </Link>)}
      </div>
      {results.length === 0 && <p className="page-search-empty" role="status">{noMatches}</p>}
    </div>}
  </div>;
}
