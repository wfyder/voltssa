# VoltSSA — mapa inteligente de recarga em Salvador

Mapa 3D dos eletropostos de Salvador (BA) com custo real de recarga, fila e reserva, navegação passo a passo pelo
relevo da cidade e uma visão Smart City de onde faltam pontos de recarga. Roda inteiro no navegador, sem backend e
sem nenhuma chave de API.

Resumo completo do projeto em PDF: [docs/VoltSSA-resumo.pdf](docs/VoltSSA-resumo.pdf).

## Como rodar

Requer Node.js 20.19+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes unitários (Vitest)
npm run build      # typecheck + build de produção
```

## Stack

- React 19, TypeScript (strict), Vite, Tailwind CSS 4, Zustand
- MapLibre GL + react-map-gl, estilo OpenFreeMap Liberty, prédios 3D
- Relevo 3D com tiles AWS Terrarium (exagero 1,8×)
- Turf.js para geoprocessamento, OSRM para rotas
- Geolocation API (GPS) e Web Speech API (voz em pt-BR)

## Funcionalidades

- **Status colaborativo:** pinos por status, score de confiabilidade, antifraude por geolocalização (reporte de
  quebra só a menos de 100 m) e consenso de 3 reportes ou check-in presencial.
- **Filtros:** veículo, plugue (Tipo 2 / CCS2), velocidade, gratuitos, abertos agora, hora simulada do sistema.
- **Custo real:** energia minuto a minuto (inclui tarifa de ponta), taxa de desbloqueio e estacionamento.
- **Fila e reserva:** reserva com mutex e simulador de race condition (overbooking com e sem trava).
- **Subsolo offline:** planta SVG do piso G1 dos shoppings.
- **Rota e navegação:** perfil de elevação, consumo ajustado pelo relevo e navegação estilo Waze com voz, recálculo
  ao sair da rota e modo simulado ou GPS real.
- **Smart City:** mapa de calor, desertos de recarga (Cajazeiras, Subúrbio, Cidade Baixa), indicadores e Chaos Mode
  (queda OCPP, divisão de potência, relatório de testes).
- **Cadastro de postos:** adicionar, editar e remover postos, com validações (dentro de Salvador, potência coerente
  com o plugue, duplicatas).
- **Localização atual:** pede o GPS ao abrir o app e no botão "Minha localização", com aviso de permissão negada,
  precisão no mapa e alerta quando você está fora de Salvador.
- **Mobile:** layout próprio para celular (lista e detalhes em painéis deslizantes, botões grandes) e instalável
  como app (PWA).
- **Modo carro (estilo CarPlay):** tela de toque fácil e sem digitação, com os postos utilizáveis mais próximos e
  um "Ir" que já inicia a navegação. Abra pelo botão "Modo carro" ou com `?modo=carro` na URL.

## Celular e GPS

`npm run dev` atende só em `localhost`. Para abrir no celular pela rede local use `npm run dev:lan` (expõe o servidor
para a rede: use só em redes confiáveis). O navegador só libera o GPS em HTTPS (ou `localhost`), então para testar a
localização no celular use um endereço HTTPS (por exemplo, um deploy no Vercel, Netlify ou GitHub Pages).

Privacidade: o app só pede o GPS quando você toca em "Minha localização" (ou automaticamente, se a permissão já foi
dada). Para traçar rotas, a origem (arredondada para ~10 m) e o destino são enviados ao OSRM público. O build de
produção inclui uma Content-Security-Policy que limita scripts à própria origem e a rede aos serviços de mapa, relevo
e rotas.

O modo carro é uma interface web para celular no suporte ou navegador do carro. Rodar dentro do CarPlay exige um
app iOS nativo (CarPlay framework, categoria *EV charging*) com autorização da Apple.

## Estrutura

```
src/
├── data/        base dos 43 eletropostos, veículos e zonas da cidade
├── lib/         regras de negócio puras + testes
├── store/       estado global (Zustand)
├── hooks/       dados derivados para a interface
└── components/  mapa, barra lateral, painel do posto, navegação, painéis
```

## Testes

`npm test` roda os testes unitários das regras de negócio. Todos os controles da interface têm `data-testid`. Em
desenvolvimento ou em um build com `VITE_E2E=1`, o estado fica exposto em `window.__voltStore` para automação E2E
(Playwright); no build de produção normal ele não é exposto.

## Limitações

Ocupação, reservas, reportes e falhas OCPP são simulados localmente; postos cadastrados ficam salvos só no navegador.

## Fontes de dados

OpenFreeMap / OpenStreetMap, AWS Terrarium (Mapzen) e OSRM. Base de eletropostos a partir de levantamento próprio.
