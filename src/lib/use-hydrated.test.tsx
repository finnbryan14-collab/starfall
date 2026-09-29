import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { useHydrated } from './use-hydrated';

function Capability() {
  return <output>{useHydrated() ? 'browser' : 'server'}</output>;
}

describe('useHydrated', () => {
  it('is false in the prerendered HTML', () => {
    // Anything branching on a browser capability must render the server's
    // answer first, or React throws the markup away and re-renders.
    expect(renderToStaticMarkup(<Capability />)).toContain('server');
  });

  it('is true once mounted in a browser', () => {
    render(<Capability />);
    expect(screen.getByRole('status')).toHaveTextContent('browser');
  });
});
