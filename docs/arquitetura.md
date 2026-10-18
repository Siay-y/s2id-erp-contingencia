# Arquitetura e convenções

Como o projeto é organizado: camadas, pastas, persistência, modelo de dados e convenções de código.

[Voltar ao README](../README.md)

---

## Estrutura do projeto

```
s2id-erp-contingencia/
├── public/
│   ├── favicon.svg                   Marca do app; inverte as cores com a aba em tema escuro
│   ├── favicon.ico                   16, 32 e 48 px para navegadores antigos
│   └── apple-touch-icon.png          180 px para a tela inicial do iPhone
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   └── ui/modal/                 Modal nativa: modelo, serviço (fila em signals) e host
│   │   ├── domain/                       Regras de negócio, sem Angular e sem armazenamento
│   │   │   ├── entities/                 Abrigo, veículo, ordem de despacho, estado da simulação
│   │   │   │                             e as funções puras de cada um (check-in, abastecimento...)
│   │   │   ├── errors/                   DomainError, com código para a interface tratar
│   │   │   ├── repositories/             ContingencyRepository (contrato abstrato)
│   │   │   ├── shared/                   Arredondamentos e validações numéricas
│   │   │   └── use-cases/                PrescriptiveLogisticsAiUseCase (motor prescritivo)
│   │   ├── data/                         Implementações concretas do contrato
│   │   │   ├── repositories/             LocalStorageContingencyRepository
│   │   │   ├── seed/                     Abrigos, frota e ordens iniciais
│   │   │   ├── storage/                  JsonStorage e as chaves do localStorage
│   │   │   └── provide-contingency-data.ts   Raiz de composição (liga contrato e implementação)
│   │   ├── presentation/                 Tudo o que o operador vê
│   │   │   ├── controllers/              ContingencyErpFacade e o cálculo dos KPIs da Meta 9.2.4
│   │   │   ├── components/               erp-header, kpi-summary-cards, priority-dispatch-card,
│   │   │   │                             shelter-management-panel e shelter-sheet
│   │   │   ├── formatters/               Números em pt-BR e as frases da prescrição
│   │   │   ├── mappers/                  Status, acesso e autonomia para tons do design system
│   │   │   └── pages/                    contingency-dashboard, a única peça que injeta o facade
│   │   ├── app.config.ts                 Providers, locale pt-BR e fonte dos ícones
│   │   ├── app.routes.ts                 Painel em `/`, carregado sob demanda; o resto redireciona
│   │   ├── app.routes.server.ts          Renderização só no cliente
│   │   └── app.ts                        Componente raiz: router outlet e o host da modal
│   ├── styles/
│   │   ├── _tokens.scss                  Paleta, raios, sombras, espaçamento, motion, fontes
│   │   ├── _reset.scss                   Reset mínimo
│   │   ├── _typography.scss              Escala tipográfica e Material Symbols
│   │   ├── _animations.scss              fade-in-up, pulse-subtle, card-hover, skeleton
│   │   ├── _material.scss                Tema Material 3 e overrides de componentes
│   │   └── _utilities.scss               Container, cards, badges de ícone, tons, grids
│   ├── index.html
│   ├── main.ts / main.server.ts / server.ts
│   └── styles.scss
├── docs/
├── angular.json
├── LICENSE
├── package.json
└── tsconfig.json
```

---

## Camadas

A separação segue Clean Architecture. As dependências apontam sempre para
dentro: a apresentação conhece o domínio, a camada `data` conhece o domínio, e
o domínio não conhece ninguém.

| Camada | Pode importar | Não pode importar |
| --- | --- | --- |
| `domain` | Apenas o próprio `domain` | Angular, `data`, componentes, `localStorage` |
| `data` | `domain`, `@angular/core` | Componentes e telas |
| `core/ui` | Angular e Material | `domain`, `data`, `presentation` |
| `presentation` | `domain` (contrato, entidades, use case), `core/ui` | `data` diretamente |

### Inversão de dependência

`ContingencyRepository` é uma classe abstrata, não uma interface, porque
interfaces somem na compilação e não servem de token de injeção. A tela pede
`inject(ContingencyRepository)` e recebe a implementação escolhida em
`provideContingencyData()`. Trocar o `localStorage` por uma API é trocar uma
linha nessa função.

O use case não tem `@Injectable`: é uma classe TypeScript pura, entregue ao
Angular por `useFactory`. Isso mantém o domínio testável com `new`, sem
`TestBed`.

### Responsabilidades

| Peça | Responsabilidade |
| --- | --- |
| Entidades (`*.entity.ts`) | Tipos e funções puras de transição: `applyCheckIn`, `receiveSupplies`, `startMission`, `applyEmergencySurge`, validações |
| `PrescriptiveLogisticsAiUseCase` | Consumo, autonomia, risco, status, explicabilidade e prescrição |
| `ContingencyRepository` | Contrato de leitura, gravação, fila offline, simulação e reset |
| `LocalStorageContingencyRepository` | Orquestra entidades e motor e grava cada coleção como uma unidade |
| `JsonStorage` | JSON tipado sobre o `localStorage`, fallback em memória e evento entre abas |
| `ContingencyErpFacade` | Estado da tela em signals, prescrição do abrigo em foco, KPIs e os fluxos com modal |
| `ModalService` / `ModalComponent` | Fila de modais e o host que as desenha, prende o foco e trata ESC |
| Página `contingency-dashboard` | Liga signals do facade a inputs e outputs dos componentes a métodos do facade; guarda só se a gaveta está aberta |
| Componentes | Apresentação pura: `input()`, `output()` e `computed()`, sem injetar serviço de domínio |

### Controller e componentes

O padrão é MVC com o facade no papel de controller. Só a página injeta o
`ContingencyErpFacade`; header, KPIs e painel recebem dados por `input()` e
avisam intenções por `output()`. Com isso cada componente pode ser testado ou
reaproveitado sem repositório, e trocar um fluxo (por exemplo, pedir uma
segunda confirmação antes do reset) mexe só no facade.

Erros de regra (`DomainError`) nunca chegam ao componente: o facade os captura
e abre uma modal de erro com a mensagem do domínio. Qualquer outro erro sobe
para o `ErrorHandler` do Angular, porque esconder um bug atrás de uma modal
genérica atrasaria o diagnóstico.

### Modal nativa

`ModalService.open()` devolve uma `Promise` com o `id` da ação escolhida, ou
`null` se a modal for dispensada; `confirm()` e `alert()` são atalhos sobre ela.
As modais formam uma fila: uma modal aberta durante outra espera a vez em vez
de sobrescrevê-la. O `ModalComponent` é montado uma única vez no `App`, anima
entrada e saída com `animate.enter` e `animate.leave`, prende o Tab dentro do
diálogo, devolve o foco a quem abriu e trava a rolagem do `body`.

### Reatividade

O contrato é síncrono e não expõe Signals, para o domínio não depender do
Angular. A ponte fica em `subscribe()`: o repositório avisa a cada gravação,
inclusive as feitas em outra aba, e o `ContingencyErpFacade` relê as coleções
para dentro de `signal()` e deriva o restante com `computed()`. Nenhum método do
facade atualiza signal à mão depois de gravar: a notificação já faz isso.

### SSR

O projeto mantém o servidor SSR gerado pelo Angular CLI, mas as rotas usam
`RenderMode.Client`. Os dados vivem no `localStorage` do dispositivo: um HTML
pré-renderizado no servidor mostraria o seed por um instante e a hidratação
trocaria pelos dados reais, com números piscando na tela. Se algum código rodar
no servidor, o `JsonStorage` trabalha em memória.

---

## Persistência

| Chave | Conteúdo |
| --- | --- |
| `s2id_pro_shelters` | Abrigos, já com autonomia, risco, status e explicabilidade calculados |
| `s2id_pro_fleet` | Frota de resgate e suprimentos |
| `s2id_pro_orders` | Ordens de despacho, da mais recente para a mais antiga |
| `s2id_pro_offline_mode` | `true` quando o modo offline está ativo |
| `s2id_pro_simulation` | Quantos picos foram simulados e quando foi o último |
| `s2id_pro_seed_version` | Versão do seed que gerou os dados gravados |
| `s2id_pro_theme` | Tema escolhido: `system`, `light` ou `dark` (lido no `index.html`) |

Regras:

- Cada coleção é lida do disco a cada chamada; não há cache que fique velho
  quando outra aba grava.
- Chave ausente, JSON inválido ou formato inesperado faz a coleção voltar ao
  seed sozinha. As demais coleções não são tocadas.
- O seed de abrigos guarda apenas dados operacionais. Autonomia, risco e
  explicabilidade saem do motor no momento do seed, então mudar uma taxa de
  consumo muda o seed sem editar número nenhum à mão.
- Quando a versão gravada difere de `SEED_VERSION`, todas as chaves do plano
  voltam ao seed atual na abertura. Toda mudança no seed sobe esse número,
  senão quem já abriu o app continua vendo os dados antigos.
- O reset restaura as seis chaves do plano e preserva o tema.

---

## Modelo de dados

### `Shelter`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | `string` | |
| `nome` | `string` | |
| `municipio` / `uf` | `string` | UF com duas letras maiúsculas |
| `baciaHidrografica` | `string` | |
| `acessoViario` | `'LIVRE' \| 'RESTRITO' \| 'ISOLADO'` | Define os modais que alcançam o abrigo |
| `capacidadeTotal` | `number` | Inteiro maior que zero |
| `ocupacaoAtual` | `number` | Pode passar da capacidade |
| `gruposVulneraveis` | `{ idosos, criancas, pcd, pets }` | Idosos, crianças e PcD contam dentro da ocupação; pets não |
| `estoque` | `{ aguaLitros, refeicoesUnidades, kitsMedicos }` | |
| `autonomiaHoras` | `{ agua, alimentos, medicamentos }` | **Calculado.** Uma casa decimal, teto de 720 h |
| `riscoColapsoIA` | `number` | **Calculado.** 0 a 100 |
| `status` | `'ESTÁVEL' \| 'ATENÇÃO' \| 'SOBRECARGA' \| 'COLAPSO LOGÍSTICO'` | **Calculado** a partir do risco |
| `aiExplainability` | `{ taxaOcupacao, burnRateSuprimentos, indiceVulnerabilidade, isolamentoViario }` | **Calculado.** Inteiros que somam 100 |
| `atualizadoEm` | ISO 8601 | |

`ShelterOperationalData` é o `Shelter` sem os campos calculados: é o que o
operador informa e o que o motor recebe.

### `FleetVehicle`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | `string` | |
| `prefixo` | `string` | Único na frota; é por ele que a ordem referencia o veículo |
| `modelo` | `string` | |
| `modal` | `'TERRESTRE' \| 'FLUVIAL' \| 'AÉREO'` | |
| `iconeMaterial` | `string` | Glifo do Material Symbols |
| `status` | `'DISPONÍVEL' \| 'EM MISSÃO' \| 'MANUTENÇÃO'` | Só `DISPONÍVEL` entra na prescrição e no despacho |
| `localizacaoAtual` | `string` | Usada para preferir veículos no município do abrigo |
| `capacidadeCargaKg` | `number` | Maior que zero |

### `DispatchOrder`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | `string` | `crypto.randomUUID()`, com alternativa para HTTP sem contexto seguro |
| `protocoloS2id` | `string` | `S2ID-PC-UF-AAAA-NNNNNN`, sequência global crescente |
| `dataHora` | ISO 8601 | |
| `abrigoId` / `abrigoNome` | `string` | O nome é copiado para o histórico não mudar se o abrigo for renomeado |
| `veiculoPrefixo` | `string` | |
| `itensDespachados` | `{ aguaLitros, refeicoes, kitsMedicos }` | Inteiros não negativos, ao menos um maior que zero |
| `tempoDecisaoMinutos` | `number` | Do alerta à decisão; compara IA e operador |
| `origem` | `'IA_PRESCRITIVA' \| 'MANUAL_OPERADOR'` | |
| `sincronizadoNuvem` | `boolean` | `false` enquanto está na fila offline |
| `entregueEm` | ISO 8601 ou `null` | `null` enquanto a carga está em trânsito |

### `SimulationState`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `picosSimulados` | `number` | |
| `ultimoPicoEm` | ISO 8601 \| `null` | |

---

## Convenções de código

- **Sem NgModules.** Componentes standalone com `imports` explícitos.
- **Fluxo de controle nativo.** Apenas `@if`, `@for`, `@switch` e `@let`.
- **Signals para estado.** `signal`, `computed`, `effect`, `input()`,
  `output()`, `model()` e `inject()`.
- **Sem `any`.** `strict`, `strictTemplates`, `noImplicitOverride`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch` e
  `noPropertyAccessFromIndexSignature` ativos.
- **Domínio puro.** Nada em `domain/` importa Angular, e nenhuma função de
  domínio altera o objeto recebido: toda transição devolve um novo objeto.
- **Erros de regra são `DomainError`** com `code`, para a interface reagir sem
  comparar mensagens.
- **Nomenclatura em inglês** para classes, métodos e funções; **campos das
  entidades, textos de interface e comentários em português**, porque o
  vocabulário do domínio é o da Defesa Civil. Comentário explica o porquê de
  uma decisão, não o que a linha faz, e existe só em TypeScript: templates e
  folhas de estilo não levam comentário.
- **Membros usados apenas no template** marcados como `protected readonly`.
- **Testes onde o erro é silencioso.** O alvo é a matemática do motor e a
  atomicidade das gravações: um número errado ali entra como dado válido e
  orienta um despacho real. Layout segue verificado a olho, pelo build com
  `strictTemplates` e pelo navegador.
