import { ImageResponse } from 'next/og';

/**
 * The card that shows when someone pastes the link.
 *
 * This app gets shared by sending a URL to a friend in Discord, so the
 * unfurled card *is* the first impression. Drawn the same way as the icons —
 * original marks and tokens only, no HoYoverse art (DESIGN.md), and no font
 * fetched at request time.
 *
 * The one number is the point: other planners count pulls, this one answers in
 * probabilities, and the card should say so before anyone clicks.
 */

export const alt = 'Starfall — your actual odds of getting the character you want';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#141739';
const GOLD = '#e7b75f';
const STARLIGHT = '#ece6d6';
const DIM = '#a2a5cc';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: INK,
        padding: '0 96px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width={34} height={34} viewBox="0 0 16 16">
          <path d="M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4 Z" fill={GOLD} />
        </svg>
        <span style={{ color: STARLIGHT, fontSize: 34, letterSpacing: 1 }}>Starfall</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 20,
          marginTop: 28,
          color: STARLIGHT,
        }}
      >
        <span style={{ fontSize: 176, lineHeight: 1, letterSpacing: -4 }}>72.9</span>
        <span style={{ fontSize: 68, color: GOLD }}>%</span>
      </div>

      <div style={{ display: 'flex', marginTop: 24, color: DIM, fontSize: 40, maxWidth: 900 }}>
        chance you get them by the banner&rsquo;s end, with the 108 pulls you&rsquo;ll have.
      </div>

      <div style={{ display: 'flex', marginTop: 40, color: GOLD, fontSize: 28 }}>
        A Genshin planner that answers in probabilities, not pull counts.
      </div>
    </div>,
    size,
  );
}
