import { ImageResponse } from 'next/og';

/**
 * iOS home-screen icon.
 *
 * iOS does not round or pad it for you and ignores the manifest's icons, so
 * this is a separate 180px square with the star sized to sit inside the
 * rounded mask iOS applies.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#141739',
      }}
    >
      <svg width={104} height={104} viewBox="0 0 16 16">
        <path d="M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4 Z" fill="#e7b75f" />
      </svg>
    </div>,
    size,
  );
}
