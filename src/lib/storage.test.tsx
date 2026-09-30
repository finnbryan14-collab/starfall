import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { readOr, reportStorageFailure, resetStorageHealth, useStorageHealthy } from './storage';

function Health() {
  return <output>{useStorageHealthy() ? 'healthy' : 'blocked'}</output>;
}

afterEach(() => {
  resetStorageHealth();
});

describe('readOr', () => {
  it('passes a successful read straight through', async () => {
    expect(await readOr(async () => 'stored', 'fallback')).toBe('stored');
  });

  it('answers with the fallback when storage refuses', async () => {
    const blocked = async () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };

    expect(await readOr(blocked, 'fallback')).toBe('fallback');
  });

  it('does not swallow the failure silently', async () => {
    await readOr(async () => {
      throw new Error('blocked');
    }, null);

    render(<Health />);
    expect(screen.getByRole('status')).toHaveTextContent('blocked');
  });
});

describe('useStorageHealthy', () => {
  it('assumes storage works until something says otherwise', () => {
    render(<Health />);
    expect(screen.getByRole('status')).toHaveTextContent('healthy');
  });

  it('re-renders whatever is watching when a read fails', () => {
    render(<Health />);
    expect(screen.getByRole('status')).toHaveTextContent('healthy');

    // Wrapped in act because the store is updated from outside React, which is
    // exactly how it happens in the app: a rejected read, not an event handler.
    act(() => reportStorageFailure());
    expect(screen.getByRole('status')).toHaveTextContent('blocked');
  });

  it('stays blocked once it has failed', () => {
    // A browser that refused once will refuse again; a banner that flickered
    // as reads came and went would be worse than one that stays put.
    reportStorageFailure();
    reportStorageFailure();

    render(<Health />);
    expect(screen.getByRole('status')).toHaveTextContent('blocked');
  });
});
