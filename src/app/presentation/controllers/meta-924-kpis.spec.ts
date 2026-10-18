import {
  createSeedFleet,
  createSeedOrders,
  createSeedShelters,
} from '../../data/seed/contingency.seed';
import { PrescriptiveLogisticsAiUseCase } from '../../domain/use-cases/prescriptive-logistics-ai.use-case';
import { DECISION_TIME_TARGET_MINUTES, computeMeta924Kpis } from './meta-924-kpis';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const ai = new PrescriptiveLogisticsAiUseCase();

describe('computeMeta924Kpis', () => {
  const shelters = createSeedShelters(NOW).map((s) => ai.assess(s));

  it('soma população, capacidade e grupos vulneráveis', () => {
    const kpis = computeMeta924Kpis(shelters, createSeedFleet(), createSeedOrders(NOW));

    const sum = (pick: (s: (typeof shelters)[number]) => number) =>
      shelters.reduce((total, s) => total + pick(s), 0);

    expect(kpis.populacaoAbrigada).toBe(sum((s) => s.ocupacaoAtual));
    expect(kpis.capacidadeTotal).toBe(sum((s) => s.capacidadeTotal));
    expect(kpis.vulneraveis).toBe(kpis.idosos + kpis.criancas + kpis.pcd);
    expect(kpis.pets).toBe(sum((s) => s.gruposVulneraveis.pets));
  });

  it('conta os abrigos por status', () => {
    const kpis = computeMeta924Kpis(shelters, [], []);

    expect(kpis.abrigosPorStatus).toEqual({
      ESTÁVEL: 3,
      ATENÇÃO: 2,
      SOBRECARGA: 2,
      'COLAPSO LOGÍSTICO': 1,
    });
    expect(kpis.totalAbrigos).toBe(shelters.length);
  });

  it('aponta o item e o abrigo com a menor autonomia', () => {
    const kpis = computeMeta924Kpis(shelters, createSeedFleet(), []);

    expect(kpis.autonomiaCritica).toEqual({
      horas: 11.1,
      item: 'água',
      abrigoId: 'abrigo-mucum-rs',
      abrigoNome: 'Ginásio Municipal de Muçum',
    });
  });

  it('ignora abrigos vazios na autonomia crítica', () => {
    const empty = shelters.map((s) =>
      ai.assess({
        ...s,
        ocupacaoAtual: 0,
        gruposVulneraveis: { idosos: 0, criancas: 0, pcd: 0, pets: 0 },
      }),
    );
    expect(computeMeta924Kpis(empty, [], []).autonomiaCritica).toBeNull();
  });

  it('separa o tempo de decisão da IA e do operador', () => {
    const kpis = computeMeta924Kpis(shelters, createSeedFleet(), createSeedOrders(NOW));

    expect(kpis.tempoDecisaoIaMin).toBe(4);
    expect(kpis.tempoDecisaoManualMin).toBe(37);
    expect(kpis.tempoDecisaoMedioMin).toBe(20.5);
    expect(kpis.metaTempoDecisaoMin).toBe(DECISION_TIME_TARGET_MINUTES);
    expect(kpis.dentroDaMetaDeDecisao).toBe(false);
  });

  it('sem ordens, o tempo de decisão fica nulo em vez de zero', () => {
    const kpis = computeMeta924Kpis(shelters, createSeedFleet(), []);

    expect(kpis.tempoDecisaoMedioMin).toBeNull();
    expect(kpis.dentroDaMetaDeDecisao).toBeNull();
  });

  it('conta a frota por situação', () => {
    const kpis = computeMeta924Kpis(shelters, createSeedFleet(), []);

    expect(kpis.frotaDisponivel).toBe(3);
    expect(kpis.frotaManutencao).toBe(1);
    expect(kpis.frotaEmMissao).toBe(0);
    expect(kpis.frotaOperacionalPct).toBe(75);
  });
});
