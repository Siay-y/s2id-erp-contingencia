import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ContingencyRepository } from '../domain/repositories/contingency.repository';
import { PrescriptiveLogisticsAiUseCase } from '../domain/use-cases/prescriptive-logistics-ai.use-case';
import { LocalStorageContingencyRepository } from './repositories/local-storage-contingency.repository';

/**
 * Raiz de composição do plano de contingência. O domínio não conhece Angular,
 * então o use case entra por fábrica; trocar o armazenamento local por uma
 * API é trocar apenas o `useClass` abaixo.
 */
export function provideContingencyData(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: PrescriptiveLogisticsAiUseCase,
      useFactory: () => new PrescriptiveLogisticsAiUseCase(),
    },
    { provide: ContingencyRepository, useClass: LocalStorageContingencyRepository },
  ]);
}
