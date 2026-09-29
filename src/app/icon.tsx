import { ImageResponse } from 'next/og';

/**
 * App icons, drawn rather than shipped as binaries.
 *
 * DESIGN.md requires the name, wordmark and icons to be original — no
 * HoYoverse art — so this is the same gold four-point star as the wordmark on
 * the night-indigo ground, generated at each size the manifest asks for.
 */

export function generateImageMetadata() {
  return [
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

export default function Icon({ id }: { id: string }) {
  const size = id === '512' ? 512 : 192;
  const star = size * 0.62;

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
      <svg width={star} height={star} viewBox="0 0 16 16">
        <path d="M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4 Z" fill="#e7b75f" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
