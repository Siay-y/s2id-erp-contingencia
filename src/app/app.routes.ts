import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'S2iD Contingência Pro',
    loadComponent: () =>
      import('./presentation/pages/contingency-dashboard/contingency-dashboard.page').then(
        (m) => m.ContingencyDashboardPage,
      ),
  },
  { path: '**', redirectTo: '' },
];
