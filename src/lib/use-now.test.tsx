import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetClockReading, useMountedNow } from './use-now';

function Clock() {
  const now = useMountedNow();
  return <output>{now === null ? 'server' : now.toISOString()}</output>;
}

describe('useMountedNow', () => {
  beforeEach(() => {
    resetClockReading();
    vi.useRealTimers();
  });

  it('renders nothing clock-dependent on the server', () => {
    // The whole point: prerendered HTML must not carry the build clock.
    expect(renderToStaticMarkup(<Clock />)).toContain('server');
  });

  it('reads the clock once mounted in the browser', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));

    render(<Clock />);
    expect(screen.getByRole('status')).toHaveTextContent('2026-09-29T10:00:00.000Z');
  });

  it('keeps the same reading across re-renders', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));

    const view = render(<Clock />);
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'));
    view.rerender(<Clock />);

    // A snapshot that changed every call would send React into a loop.
    expect(screen.getByRole('status')).toHaveTextContent('2026-09-29T10:00:00.000Z');
  });
});
