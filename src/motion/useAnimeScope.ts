'use client';

import { createScope, type Scope } from 'animejs';
import { useEffect, type RefObject } from 'react';

/**
 * anime.js scoped to a React component.
 *
 * The official v4 React pattern: create a scope rooted at the component's
 * element inside useEffect, and revert it on cleanup so every animation, and
 * every property anime.js touched, is undone when the component unmounts
 * (CLAUDE.md, DESIGN.md).
 *
 * `setup` receives the scope. Register animations with `scope.add(...)`.
 */
export function useAnimeScope(
  root: RefObject<HTMLElement | null>,
  setup: (scope: Scope) => void,
  deps: React.DependencyList = [],
) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const scope = createScope({ root: element });
    setup(scope);

    return () => {
      scope.revert();
    };
    // `setup` is intentionally not a dependency: callers pass an inline
    // function, and depending on it would tear the scope down every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, ...deps]);
}
