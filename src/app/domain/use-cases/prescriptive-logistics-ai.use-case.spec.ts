import { createSeedFleet, createSeedShelters } from '../../data/seed/contingency.seed';
import { FleetVehicle } from '../entities/fleet-vehicle.entity';
import { ShelterOperationalData, receiveSupplies } from '../entities/shelter.entity';
import {
  AUTONOMY_CEILING_HOURS,
  AUTONOMY_TARGET_HOURS,
  PrescriptiveLogisticsAiUseCase,
  RISK_FLOORS,
} from './prescriptive-logistics-ai.use-case';

const NOW = new Date('2026-10-16T12:00:00.000Z');

function shelter(overrides: Partial<ShelterOperationalData> = {}): ShelterOperationalData {
  return {
    id: 'abrigo-teste',
    nome: 'Abrigo Teste',
    municipio: 'Muçum',
    uf: 'RS',
    baciaHidrografica: 'Bacia do Rio Taquari',
    acessoViario: 'LIVRE',
    capacidadeTotal: 100,
    ocupacaoAtual: 24,
    gruposVulneraveis: { idosos: 0, criancas: 0, pcd: 0, pets: 0 },
    estoque: { aguaLitros: 360, refeicoesUnidades: 72, kitsMedicos: 100 },
    atualizadoEm: NOW.toISOString(),
    ...overrides,
  };
}

function vehicle(overrides: Partial<FleetVehicle>): FleetVehicle {
  return {
    id: 'v',
    prefixo: 'V',
    modelo: 'Modelo',
    modal: 'TERRESTRE',
    iconeMaterial: 'local_shipping',
    status: 'DISPONÍVEL',
    localizacaoAtual: 'Base, Porto Alegre/RS',
    capacidadeCargaKg: 1000,
    ...overrides,
  };
}

describe('PrescriptiveLogisticsAiUseCase', () => {
  const ai = new PrescriptiveLogisticsAiUseCase();

  it('calcula a autonomia pelo consumo por habitante', () => {
    const assessed = ai.assess(shelter());

    expect(assessed.autonomiaHoras.agua).toBe(24);
    expect(assessed.autonomiaHoras.alimentos).toBe(24);
  });

  it('pets consomem água, mas não refeições', () => {
    const base = ai.hourlyConsumption(shelter());
    const withPets = ai.hourlyConsumption(
      shelter({ gruposVulneraveis: { idosos: 0, criancas: 0, pcd: 0, pets: 16 } }),
    );

    expect(withPets.aguaLitros).toBeCloseTo(base.aguaLitros + 1);
    expect(withPets.refeicoes).toBe(base.refeicoes);
  });

  it('abrigo vazio tem autonomia no teto e nenhum envio prescrito', () => {
    const assessed = ai.assess(shelter({ ocupacaoAtual: 0 }));
    const prescription = ai.prescribe(assessed, createSeedFleet());

    expect(assessed.autonomiaHoras.agua).toBe(AUTONOMY_CEILING_HOURS);
    expect(prescription.necessitaEnvio).toBe(false);
    expect(prescription.veiculo).toBeNull();
    expect(Object.is(prescription.cargaTotalKg, 0)).toBe(true);
    expect(Object.is(prescription.itens.aguaLitros, 0)).toBe(true);
  });

  it('a explicabilidade soma exatamente 100 em todos os cenários', () => {
    const scenarios = [
      ...createSeedShelters(NOW),
      shelter({ ocupacaoAtual: 0 }),
      shelter({ acessoViario: 'ISOLADO', ocupacaoAtual: 100 }),
    ];

    for (const scenario of scenarios) {
      const weights = ai.assess(scenario).aiExplainability;
      const total =
        weights.taxaOcupacao +
        weights.burnRateSuprimentos +
        weights.indiceVulnerabilidade +
        weights.isolamentoViario;

      expect(total).toBe(100);
      expect(Object.values(weights).every(Number.isInteger)).toBe(true);
    }
  });

  it('autonomia crítica força o colapso logístico', () => {
    const assessed = ai.assess(
      shelter({ estoque: { aguaLitros: 60, refeicoesUnidades: 1000, kitsMedicos: 100 } }),
    );

    expect(assessed.autonomiaHoras.agua).toBe(4);
    expect(assessed.riscoColapsoIA).toBeGreaterThanOrEqual(RISK_FLOORS.autonomiaCritica);
    expect(assessed.status).toBe('COLAPSO LOGÍSTICO');
  });

  it('ocupação acima da capacidade nunca sai como estável', () => {
    const assessed = ai.assess(
      shelter({
        ocupacaoAtual: 110,
        estoque: { aguaLitros: 100_000, refeicoesUnidades: 100_000, kitsMedicos: 1000 },
      }),
    );

    expect(assessed.riscoColapsoIA).toBeGreaterThanOrEqual(RISK_FLOORS.acimaDaCapacidade);
    expect(assessed.status).toBe('SOBRECARGA');
  });

  it('o seed abre com os quatro status diferentes', () => {
    const statuses = createSeedShelters(NOW).map((item) => ai.assess(item).status);

    expect(new Set(statuses)).toEqual(
      new Set(['ESTÁVEL', 'ATENÇÃO', 'SOBRECARGA', 'COLAPSO LOGÍSTICO']),
    );
  });

  it('a prescrição recompõe a meta de autonomia em todos os itens', () => {
    for (const item of createSeedShelters(NOW)) {
      const assessed = ai.assess(item);
      const prescription = ai.prescribe(assessed, createSeedFleet());
      const supplied = ai.assess(receiveSupplies(item, prescription.itens, NOW.toISOString()));

      expect(supplied.autonomiaHoras.agua).toBeGreaterThanOrEqual(AUTONOMY_TARGET_HOURS);
      expect(supplied.autonomiaHoras.alimentos).toBeGreaterThanOrEqual(AUTONOMY_TARGET_HOURS);
      expect(supplied.autonomiaHoras.medicamentos).toBeGreaterThanOrEqual(AUTONOMY_TARGET_HOURS);
    }
  });

  it('abrigo isolado nunca recebe veículo terrestre', () => {
    const assessed = ai.assess(shelter({ acessoViario: 'ISOLADO' }));
    const fleet = [
      vehicle({ id: 'caminhao', prefixo: 'CAM', capacidadeCargaKg: 10_000 }),
      vehicle({ id: 'barco', prefixo: 'BAR', modal: 'FLUVIAL', capacidadeCargaKg: 500 }),
    ];

    expect(ai.prescribe(assessed, fleet).veiculo?.id).toBe('barco');
  });

  it('sem modal compatível, a prescrição pede apoio externo', () => {
    const assessed = ai.assess(shelter({ acessoViario: 'ISOLADO' }));
    const prescription = ai.prescribe(assessed, [vehicle({ id: 'caminhao' })]);

    expect(prescription.necessitaEnvio).toBe(true);
    expect(prescription.veiculo).toBeNull();
    expect(prescription.justificativas.at(-1)).toContain('apoio');
  });

  it('prefere o veículo que resolve em menos viagens e, empatando, o menor', () => {
    const assessed = ai.assess(shelter());
    const fleet = [
      vehicle({ id: 'grande', capacidadeCargaKg: 8000 }),
      vehicle({ id: 'pequeno', capacidadeCargaKg: 2000 }),
      vehicle({ id: 'minimo', capacidadeCargaKg: 100 }),
    ];

    expect(ai.prescribe(assessed, fleet).veiculo?.id).toBe('pequeno');
  });

  it('ignora veículos em missão ou manutenção', () => {
    const assessed = ai.assess(shelter());
    const fleet = [
      vehicle({ id: 'missao', status: 'EM MISSÃO' }),
      vehicle({ id: 'oficina', status: 'MANUTENÇÃO' }),
    ];

    expect(ai.prescribe(assessed, fleet).veiculo).toBeNull();
  });

  it('execute ordena por risco e não promete o mesmo veículo duas vezes', () => {
    const prescriptions = ai.execute(createSeedShelters(NOW), createSeedFleet());
    const risks = prescriptions.map((item) => item.riscoColapsoIA);
    const vehicles = prescriptions.flatMap((item) => (item.veiculo ? [item.veiculo.id] : []));

    expect(risks).toEqual([...risks].sort((a, b) => b - a));
    expect(new Set(vehicles).size).toBe(vehicles.length);
  });
});
