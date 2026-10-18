import { DispatchOrder, buildS2idProtocol } from '../../domain/entities/dispatch-order.entity';
import { FleetVehicle, TRANSPORT_MODE_ICONS } from '../../domain/entities/fleet-vehicle.entity';
import { ShelterOperationalData } from '../../domain/entities/shelter.entity';

const HOUR_MS = 60 * 60 * 1000;

function hoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * HOUR_MS).toISOString();
}

/**
 * Oito abrigos inspirados em desastres reais recentes, de quatro regiões,
 * calibrados para abrir com toda a escala de risco: um em colapso, dois em
 * sobrecarga, dois em atenção e três estáveis. Muçum segue como prioridade.
 */
export function createSeedShelters(now: Date): ShelterOperationalData[] {
  return [
    {
      id: 'abrigo-mucum-rs',
      nome: 'Ginásio Municipal de Muçum',
      municipio: 'Muçum',
      uf: 'RS',
      baciaHidrografica: 'Bacia do Rio Taquari',
      acessoViario: 'ISOLADO',
      capacidadeTotal: 350,
      ocupacaoAtual: 342,
      gruposVulneraveis: { idosos: 58, criancas: 81, pcd: 17, pets: 46 },
      estoque: { aguaLitros: 2400, refeicoesUnidades: 900, kitsMedicos: 22 },
      atualizadoEm: hoursAgo(now, 1),
    },
    {
      id: 'abrigo-petropolis-rj',
      nome: 'Escola Estadual Petrópolis',
      municipio: 'Petrópolis',
      uf: 'RJ',
      baciaHidrografica: 'Bacia do Rio Piabanha',
      acessoViario: 'RESTRITO',
      capacidadeTotal: 220,
      ocupacaoAtual: 168,
      gruposVulneraveis: { idosos: 31, criancas: 44, pcd: 9, pets: 12 },
      estoque: { aguaLitros: 5200, refeicoesUnidades: 1100, kitsMedicos: 30 },
      atualizadoEm: hoursAgo(now, 2),
    },
    {
      id: 'abrigo-jaboatao-pe',
      nome: 'Centro Comunitário de Jaboatão',
      municipio: 'Jaboatão dos Guararapes',
      uf: 'PE',
      baciaHidrografica: 'Bacia do Rio Jaboatão',
      acessoViario: 'LIVRE',
      capacidadeTotal: 180,
      ocupacaoAtual: 96,
      gruposVulneraveis: { idosos: 14, criancas: 27, pcd: 5, pets: 8 },
      estoque: { aguaLitros: 6000, refeicoesUnidades: 1500, kitsMedicos: 40 },
      atualizadoEm: hoursAgo(now, 3),
    },
    {
      id: 'abrigo-blumenau-sc',
      nome: 'Pavilhão da Vila Germânica',
      municipio: 'Blumenau',
      uf: 'SC',
      baciaHidrografica: 'Bacia do Rio Itajaí',
      acessoViario: 'LIVRE',
      capacidadeTotal: 600,
      ocupacaoAtual: 512,
      gruposVulneraveis: { idosos: 74, criancas: 118, pcd: 21, pets: 63 },
      estoque: { aguaLitros: 9800, refeicoesUnidades: 2600, kitsMedicos: 45 },
      atualizadoEm: hoursAgo(now, 1),
    },
    {
      id: 'abrigo-eldorado-rs',
      nome: 'Ginásio Poliesportivo de Eldorado do Sul',
      municipio: 'Eldorado do Sul',
      uf: 'RS',
      baciaHidrografica: 'Bacia do Rio Jacuí',
      acessoViario: 'RESTRITO',
      capacidadeTotal: 450,
      ocupacaoAtual: 431,
      gruposVulneraveis: { idosos: 61, criancas: 104, pcd: 19, pets: 88 },
      estoque: { aguaLitros: 6800, refeicoesUnidades: 2100, kitsMedicos: 30 },
      atualizadoEm: hoursAgo(now, 2),
    },
    {
      id: 'abrigo-sao-sebastiao-sp',
      nome: 'Escola Municipal da Barra do Sahy',
      municipio: 'São Sebastião',
      uf: 'SP',
      baciaHidrografica: 'Bacia do Litoral Norte',
      acessoViario: 'RESTRITO',
      capacidadeTotal: 160,
      ocupacaoAtual: 118,
      gruposVulneraveis: { idosos: 17, criancas: 36, pcd: 6, pets: 9 },
      estoque: { aguaLitros: 3800, refeicoesUnidades: 1000, kitsMedicos: 18 },
      atualizadoEm: hoursAgo(now, 4),
    },
    {
      id: 'abrigo-rio-branco-ac',
      nome: 'Parque de Exposições de Rio Branco',
      municipio: 'Rio Branco',
      uf: 'AC',
      baciaHidrografica: 'Bacia do Rio Acre',
      acessoViario: 'LIVRE',
      capacidadeTotal: 800,
      ocupacaoAtual: 455,
      gruposVulneraveis: { idosos: 52, criancas: 141, pcd: 14, pets: 70 },
      estoque: { aguaLitros: 30000, refeicoesUnidades: 7000, kitsMedicos: 120 },
      atualizadoEm: hoursAgo(now, 3),
    },
    {
      id: 'abrigo-itabuna-ba',
      nome: 'Ginásio Municipal de Itabuna',
      municipio: 'Itabuna',
      uf: 'BA',
      baciaHidrografica: 'Bacia do Rio Cachoeira',
      acessoViario: 'LIVRE',
      capacidadeTotal: 240,
      ocupacaoAtual: 74,
      gruposVulneraveis: { idosos: 9, criancas: 18, pcd: 3, pets: 5 },
      estoque: { aguaLitros: 6000, refeicoesUnidades: 1200, kitsMedicos: 40 },
      atualizadoEm: hoursAgo(now, 6),
    },
  ];
}

export function createSeedFleet(): FleetVehicle[] {
  return [
    {
      id: 'frota-abts-01',
      prefixo: 'ABTS-01',
      modelo: 'Caminhão Mercedes-Benz Atego 1726 4x4',
      modal: 'TERRESTRE',
      iconeMaterial: TRANSPORT_MODE_ICONS.TERRESTRE,
      status: 'DISPONÍVEL',
      localizacaoAtual: 'Base Logística da Defesa Civil, Lajeado/RS',
      capacidadeCargaKg: 6000,
    },
    {
      id: 'frota-emb-07',
      prefixo: 'EMB-07',
      modelo: 'Embarcação de resgate em alumínio, motor 90 HP',
      modal: 'FLUVIAL',
      iconeMaterial: TRANSPORT_MODE_ICONS.FLUVIAL,
      status: 'DISPONÍVEL',
      localizacaoAtual: 'Porto fluvial de Encantado/RS',
      capacidadeCargaKg: 800,
    },
    {
      id: 'frota-arcanjo-03',
      prefixo: 'ARCANJO-03',
      modelo: 'Helicóptero Airbus H125 Esquilo',
      modal: 'AÉREO',
      iconeMaterial: TRANSPORT_MODE_ICONS.AÉREO,
      status: 'DISPONÍVEL',
      localizacaoAtual: 'Base aérea do Corpo de Bombeiros, Blumenau/SC',
      capacidadeCargaKg: 1000,
    },
    {
      id: 'frota-vtr-12',
      prefixo: 'VTR-12',
      modelo: 'Toyota Hilux 4x4 cabine dupla',
      modal: 'TERRESTRE',
      iconeMaterial: 'directions_car',
      status: 'MANUTENÇÃO',
      localizacaoAtual: 'Oficina conveniada, Petrópolis/RJ',
      capacidadeCargaKg: 1000,
    },
  ];
}

/** Uma ordem já sincronizada e outra parada na fila, para a fila offline não abrir vazia. */
export function createSeedOrders(now: Date): DispatchOrder[] {
  return [
    {
      id: 'ordem-seed-0002',
      protocoloS2id: buildS2idProtocol('RJ', now, 2),
      dataHora: hoursAgo(now, 5),
      abrigoId: 'abrigo-petropolis-rj',
      abrigoNome: 'Escola Estadual Petrópolis',
      veiculoPrefixo: 'VTR-12',
      itensDespachados: { aguaLitros: 1200, refeicoes: 400, kitsMedicos: 10 },
      tempoDecisaoMinutos: 37,
      origem: 'MANUAL_OPERADOR',
      sincronizadoNuvem: false,
      entregueEm: hoursAgo(now, 3),
    },
    {
      id: 'ordem-seed-0001',
      protocoloS2id: buildS2idProtocol('PE', now, 1),
      dataHora: hoursAgo(now, 26),
      abrigoId: 'abrigo-jaboatao-pe',
      abrigoNome: 'Centro Comunitário de Jaboatão',
      veiculoPrefixo: 'ABTS-01',
      itensDespachados: { aguaLitros: 3000, refeicoes: 800, kitsMedicos: 20 },
      tempoDecisaoMinutos: 4,
      origem: 'IA_PRESCRITIVA',
      sincronizadoNuvem: true,
      entregueEm: hoursAgo(now, 22),
    },
  ];
}

export const SEED_OFFLINE_MODE = false;

/**
 * Suba este número sempre que o seed mudar. Navegadores com dados de uma
 * versão anterior recebem o seed novo na próxima abertura.
 */
export const SEED_VERSION = 3;
