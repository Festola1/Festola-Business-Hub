import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Stage 09 PWA Manifest, Icons & Service Worker Boundary Verification', () => {
  it('verifies all declared PWA icon files exist in public/', () => {
    const requiredAssets = [
      'public/icon.svg',
      'public/apple-touch-icon.png',
      'public/pwa-192x192.png',
      'public/pwa-512x512.png',
      'public/pwa-maskable-512x512.png',
    ];

    for (const relPath of requiredAssets) {
      const fullPath = path.join(ROOT, relPath);
      expect(fs.existsSync(fullPath), `Missing PWA asset: ${relPath}`).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(0);
    }
  });

  it('verifies vite.config.ts enforces approved branding, prompt SW updates, and /api/ SW denylist', () => {
    const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("registerType: 'prompt'");
    expect(viteConfig).toContain("name: 'Festola Business Hub'");
    expect(viteConfig).toContain("short_name: 'Festola'");
    expect(viteConfig).toContain("theme_color: '#991B1B'");
    expect(viteConfig).toContain("background_color: '#F4F5F7'");
    expect(viteConfig).toContain("display: 'standalone'");
    expect(viteConfig).toContain('navigateFallbackDenylist: [/^\\/api\\//]');
  });

  it('verifies index.html includes approved theme color, iOS PWA meta tags, and synchronized title/OG tags', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('<title>Festola Business Hub</title>');
    expect(html).toContain('name="theme-color" content="#991B1B"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('property="og:title" content="Festola Business Hub"');
  });
});
