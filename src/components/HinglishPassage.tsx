"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const LATIN_WORD = /(\b[A-Za-z][A-Za-z'-]*\b)/g;

export function HinglishPassage({
  text,
  glosses,
}: {
  text: string;
  glosses: Record<string, string>;
}) {
  const [active, setActive] = useState<{ word: string; meaning: string } | null>(null);

  const parts = useMemo(() => text.split(LATIN_WORD), [text]);

  const lookup = useCallback(
    (word: string) => {
      const lower = word.toLowerCase();
      return glosses[lower] ?? glosses[word] ?? null;
    },
    [glosses],
  );

  useEffect(() => {
    if (!active) return;

    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setActive(null);
        return;
      }
      if (target.closest(".gloss-card, .hinglish-en-word")) return;
      setActive(null);
    };

    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [active]);

  return (
    <>
      <div className="reader-text hinglish">
        {parts.map((part, index) => {
          if (!/^[A-Za-z]/.test(part)) {
            return <span key={index}>{part}</span>;
          }

          const meaning = lookup(part);
          if (!meaning) {
            return <span key={index}>{part}</span>;
          }

          const isActive = active?.word === part && active.meaning === meaning;

          return (
            <button
              key={index}
              type="button"
              className={`hinglish-en-word${isActive ? " is-active" : ""}`}
              onClick={() => setActive(isActive ? null : { word: part, meaning })}
              aria-label={`${part}: ${meaning}`}
            >
              {part}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="gloss-card" role="status">
          <span className="gloss-card-word">{active.word}</span>
          <span className="gloss-card-meaning">{active.meaning}</span>
          <button type="button" className="gloss-card-close" onClick={() => setActive(null)}>
            बंद करें
          </button>
        </div>
      )}
    </>
  );
}
