import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Renderização só no cliente: os dados vivem no `localStorage` do dispositivo,
 * e um HTML pré-renderizado no servidor mostraria o seed por um instante
 * antes de a hidratação trocar pelos dados reais do operador.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
