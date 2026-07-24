import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Samme kodebase bygger to sites: Tour (tour.vejleaa.dk, uden env) og den
// samlede platform (tip.vejleaa.dk, VITE_PLATFORM_MODE=true). index.html er
// skrevet med platform-branding; dette plugin bytter manifest/ikoner/meta til
// Tour-udgaverne i Tour-buildet, så "Føj til hjemmeskærm" får rigtigt navn,
// ikon og start-url på begge sites.
// VIGTIGT: platform-deployet sætter VITE_PLATFORM_MODE via en .env-FIL (ikke
// procesmiljøet), så flaget SKAL læses med loadEnv — process.env er tomt dér.
function tourBrandingPlugin(isPlatform) {
  const swaps = [
    ['/site.webmanifest', '/site-tour.webmanifest'],
    ['/logo.svg', '/logo-tour.svg'],
    ['/favicon-32.png', '/favicon-tour-32.png'],
    ['/favicon-16.png', '/favicon-tour-32.png'], // gammelt sæt har ingen 16px — 32 skaleres fint
    ['/apple-touch-icon.png', '/apple-touch-icon-tour.png'],
    ['/og-image.png', '/icon-tour-512.png'],
    ['content="Vejleaa Tip"', 'content="Tour de France Tip"'],
    ['<meta name="apple-mobile-web-app-title" content="Tour de France Tip" />', '<meta name="apple-mobile-web-app-title" content="Tour Tip" />'],
    ['Tip Superligaen og andre spil mod dine venner — point efter oddsene, ligaer, Chancen og combi-bonus.', 'Tippekonkurrence til Tour de France med familie og venner.'],
    ['Tip Superligaen og andre spil mod dine venner.', 'Tippekonkurrence til Tour de France med familie og venner.'],
    ['<title>Vejleaa Tip — fodbold-tipping med vennerne</title>', '<title>Tour de France Tip</title>'],
  ];
  return {
    name: 'tour-branding',
    transformIndexHtml(html) {
      if (isPlatform) return html;
      let out = html;
      for (const [from, to] of swaps) out = out.split(from).join(to);
      return out;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isPlatform = env.VITE_PLATFORM_MODE === 'true';
  return {
    plugins: [react(), tourBrandingPlugin(isPlatform)],
    server: { port: 5173 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      include: ['src/**/*.{test,spec}.{js,jsx}', 'scripts/**/*.{test,spec}.mjs'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{js,jsx}'],
        exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**'],
      },
    },
  };
});
