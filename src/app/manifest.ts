import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fuel Log',
    short_name: 'Fuel Log',
    description: 'Calorie tracking with a built-in training coach',
    start_url: '/today',
    display: 'standalone',
    background_color: '#0a0f1a',
    theme_color: '#0a0f1a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
