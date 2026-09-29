import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { StepperRow } from './StepperRow';

/**
 * Keeps the component controlled from local state. `initialValue` seeds it;
 * everything else passes straight through. Spreading a `value` prop after
 * `value={value}` would pin the component and make it look broken.
 */
function Harness({
  initialValue = 11_200,
  onChange,
  ...props
}: Partial<Omit<React.ComponentProps<typeof StepperRow>, 'value'>> & { initialValue?: number }) {
  const [value, setValue] = useState(initialValue);
  return (
    <StepperRow
      label="Primogems"
      min={0}
      max={999_999}
      step={160}
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('StepperRow', () => {
  it('exposes spinbutton semantics, since a text input gives none for free', () => {
    render(<Harness />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });
    expect(input).toHaveAttribute('aria-valuenow', '11200');
    expect(input).toHaveAttribute('aria-valuemin', '0');
    expect(input).toHaveAttribute('aria-valuemax', '999999');
    // The displayed value keeps its separators; the ARIA value does not.
    expect(input).toHaveValue('11,200');
  });

  it('steps with the plus and minus buttons', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });

    await user.click(screen.getByRole('button', { name: 'Increase Primogems' }));
    expect(input).toHaveValue('11,360');

    await user.click(screen.getByRole('button', { name: 'Decrease Primogems' }));
    await user.click(screen.getByRole('button', { name: 'Decrease Primogems' }));
    expect(input).toHaveValue('11,040');
  });

  it('steps with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });

    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('11,360');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveValue('11,040');
  });

  it('jumps to the bounds with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness max={500} initialValue={100} step={10} />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });

    await user.click(input);
    await user.keyboard('{End}');
    expect(input).toHaveValue('500');

    await user.keyboard('{Home}');
    expect(input).toHaveValue('0');
  });

  it('clamps rather than running past its bounds', async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={5} min={0} max={10} step={4} />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });
    const up = screen.getByRole('button', { name: 'Increase Primogems' });

    await user.click(up);
    expect(input).toHaveValue('9');
    await user.click(up);
    expect(input).toHaveValue('10');
    expect(up).toBeDisabled();
  });

  it('lets a half-typed number stand, then reformats on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });

    await user.clear(input);
    await user.type(input, '1234');
    // Not reformatted under the cursor.
    expect(input).toHaveValue('1234');

    await user.tab();
    expect(input).toHaveValue('1,234');
  });

  it('treats unparseable input as zero rather than NaN', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('spinbutton', { name: 'Primogems' });

    await user.clear(input);
    await user.type(input, 'abc');
    await user.tab();
    expect(input).toHaveValue('0');
  });

  it('uses aria-valuetext when the bare number would be ambiguous', () => {
    render(<Harness initialValue={22} valueText={(v) => `${v} pulls since your last 5-star`} />);
    expect(screen.getByRole('spinbutton', { name: 'Primogems' })).toHaveAttribute(
      'aria-valuetext',
      '22 pulls since your last 5-star',
    );
  });

  it('describes the row from its note', () => {
    render(<Harness note="Pulls since your last 5★" />);
    const input = screen.getByRole('spinbutton', { name: /Primogems/ });
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Pulls since your last 5★');
  });

  it('clears its repeat timers on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<Harness />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
