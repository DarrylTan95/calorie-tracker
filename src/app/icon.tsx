import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0f1a',
          borderRadius: 96,
        }}
      >
        <div style={{ fontSize: 220, color: '#60a5fa', fontWeight: 800 }}>FL</div>
      </div>
    ),
    { ...size },
  );
}
