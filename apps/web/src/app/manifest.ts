import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cold Call',
    short_name: 'Cold Call',
    description: 'Chess, backgammon, Tichu and Ice Floe Battle against people or a fair bot.',
    start_url: '/play',
    display: 'standalone',
    background_color: '#0b1a2e',
    theme_color: '#0b1a2e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
