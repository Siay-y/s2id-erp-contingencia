# S2iD Contingência Pro | Luiz Santos

MVP 100% front-end, construído em Angular 22, para a gestão operacional de
planos de contingência: abrigos temporários, frota de resgate e suprimentos e
uma IA prescritiva que diz quanto enviar, para onde e com qual veículo. Não há
servidor de dados: tudo o que é registrado fica no `localStorage` do próprio
dispositivo, e a aplicação continua de pé sem conexão.

O projeto se alinha à Meta 9.2.4 do Plano Nacional de Proteção e Defesa Civil
(PN-PDC 2025-2035), "Desenvolver módulo de Plano de Contingência no S2iD 4.0",
e serve de prova de conceito para esse módulo.

---

## Visão geral

| Característica | Implementação |
| --- | --- |
| Persistência | `localStorage`, por meio de um `JsonStorage` tipado, com fallback em memória no SSR |
| Dados iniciais | Seed automático com 4 abrigos e 4 veículos quando o armazenamento está vazio ou corrompido |
| Arquitetura | Clean Architecture em três camadas: `domain`, `data` e apresentação |
| Inversão de dependência | `ContingencyRepository` é uma classe abstrata usada como token de injeção |
| IA prescritiva | Use case determinístico, sem dependência de Angular, com pesos explicáveis que somam 100% |
| Offline first | Ordens criadas sem conexão entram numa fila e sobem ao reconectar |
| Estado | Signals do Angular (`signal`, `computed`, `input`, `output`, `inject`) |
| Componentes | Standalone, sem NgModules |
| Interface | Angular Material 3 com tema próprio no estilo Google Material |
| Estilo | SCSS com tokens em variáveis CSS, tema claro e escuro |
| Animação | Somente CSS: `fade-in-up`, `pulse-subtle`, `card-hover` e barras de progresso suaves |
| Ícones | Material Symbols Rounded e Outlined |
| Fontes | Inter para texto e Roboto para títulos (Google Fonts) |
| Idioma | Português do Brasil (`LOCALE_ID` `pt-BR`) |

---

## Funcionalidades

- **Abrigos com avaliação contínua.** Cada abrigo guarda capacidade, ocupação,
  grupos vulneráveis (idosos, crianças, PcD e pets das famílias multiespécies)
  e estoque de água, refeições e kits médicos. Autonomia, risco e status são
  recalculados a cada gravação, nunca digitados.
- **Autonomia em horas** por item, a partir do consumo por habitante: 15 L de
  água por pessoa ao dia (mínimo do Projeto Esfera), 1,5 L por pet, 3 refeições
  por pessoa e kits médicos com taxa maior para idosos, crianças e PcD.
- **Risco de colapso de 0 a 100%** a partir de quatro fatores: taxa de
  ocupação, ritmo de consumo dos suprimentos, índice de vulnerabilidade e
  isolamento viário. O status sai do risco: Estável, Atenção, Sobrecarga ou
  Colapso Logístico.
- **Explicabilidade.** Cada abrigo diz quanto cada fator pesou no risco, em
  pontos percentuais inteiros que somam exatamente 100.
- **Prescrição logística automática.** Quantos litros de água, refeições e
  kits enviar para fechar 72 h de autonomia, o peso da carga, o veículo
  indicado e quantas viagens ele precisa fazer, com a justificativa em texto.
- **Escolha de veículo pelo acesso.** Abrigo isolado só recebe modal fluvial
  ou aéreo. Entre os possíveis, vence quem resolve em menos viagens, depois quem
  já está no município, depois o modal mais barato e, por fim, o menor veículo
  que dá conta. Na prescrição geral, o mesmo veículo nunca é prometido a dois
  abrigos.
- **Check-in de desabrigados** por grupo familiar, aceito mesmo acima da
  capacidade: em desastre ninguém fica na porta, e a sobrecarga aparece no risco.
- **Ordem de despacho** com protocolo `S2ID-PC-UF-AAAA-NNNNNN`, gravada como
  uma unidade: a ordem entra no histórico, o estoque do abrigo sobe e o veículo
  passa para "Em missão". Se uma regra falhar, nada é gravado.
- **Fila de sincronização offline.** Em modo offline, as ordens ficam marcadas
  como pendentes; ao voltar a ficar online a fila é descarregada.
- **Simulador de pico de emergência.** Chegada em massa proporcional à
  capacidade, agravamento do acesso viário e 12 h de consumo sem reposição,
  para treinar a resposta e ver o motor reagir.
- **Restaurar dados padrão** com um clique, sem mexer no tema escolhido.
- **Sincronização entre abas.** Duas abas abertas enxergam o mesmo estado.
- **Responsivo** desde a base: grid fluido, alvos de toque de 44 px, áreas
  seguras do iPhone e diálogos que se ajustam à largura do celular.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Angular 22 (standalone, zoneless, sem NgModules) |
| Linguagem | TypeScript 6 com `strict` e `strictTemplates` |
| Interface | Angular Material 3 e CDK |
| Estilo | SCSS |
| Build | `@angular/build:application`, com SSR e pré-renderização |
| Testes | Vitest com jsdom |
| Formatação | Prettier |

Não há backend de dados nem biblioteca de estado, de gráficos ou de animação.
O bundle inicial fica em torno de 84 kB transferidos.

---

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior

---

## Início rápido

```bash
git clone https://github.com/Siay-y/s2id-erp-contingencia.git
cd s2id-erp-contingencia
npm ci
npm start
```

A aplicação fica disponível em `http://localhost:4200/` com recarga automática a
cada alteração no código-fonte.

Para gerar a versão de produção:

```bash
npm run build
```

O resultado é escrito em `dist/s2id-erp-contingencia`, com a pasta `browser`
para o cliente e `server` para o SSR.

> **Nota para Windows:** encerre o servidor de desenvolvimento com `Ctrl+C`
> antes de rodar `npm ci`. Um processo `ng serve` ativo mantém trava sobre o
> binário do esbuild e faz a reinstalação falhar com `EPERM`.

---

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm start` | Servidor de desenvolvimento em `localhost:4200` |
| `npm run build` | Build de produção |
| `npm run watch` | Build de desenvolvimento em modo observador |
| `npm test` | Executa os testes com Vitest |
| `npm run serve:ssr:s2id-erp-contingencia` | Serve o build com SSR via Node |
| `npm run ng` | Acesso direto ao Angular CLI |

---

## Documentação

O detalhe de cada parte fica em `docs/`, para este arquivo continuar sendo uma
apresentação:

- [Arquitetura](docs/arquitetura.md): camadas, pastas, persistência, modelo de dados e convenções.
- [Regras de negócio](docs/regras-de-negocio.md): consumo, autonomia, risco, explicabilidade, prescrição, despacho, fila offline e simulação.
- [Design e acessibilidade](docs/design.md): tokens, tema Material, animações, responsividade e acessibilidade.

---

## Privacidade

- **Nenhum dado sai do dispositivo.** Não há API, analytics ou requisição a
  terceiros. As únicas requisições externas são as fontes do Google Fonts. A
  "sincronização com a nuvem" deste MVP é simulada: marca a ordem como enviada.
- **Nenhuma conta.** Não há login nem cadastro.
- **Falha de gravação não passa em silêncio.** Se o armazenamento estiver cheio
  ou bloqueado, os dados continuam em memória durante a sessão e o
  `JsonStorage` expõe a falha para a interface avisar. JSON corrompido é
  descartado e o seed volta, sem derrubar o app.
- **Limpar os dados do site apaga tudo.** O `localStorage` pertence ao
  navegador; o seed volta no próximo acesso.

---

## Licença

Distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE).

Copyright © 2026 Luiz Henrique Porfírio Santos.

---

## Contato

- GitHub: [@Siay-y](https://github.com/Siay-y)
- LinkedIn: [Luiz Henrique Porfírio Santos](https://www.linkedin.com/in/luiz-henrique-porf%C3%ADrio-santos-a8b77229a/)
- E-mail: luiz.porfiriosantos@gmail.com
