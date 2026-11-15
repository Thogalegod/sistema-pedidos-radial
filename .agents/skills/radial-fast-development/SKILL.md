---
name: radial-fast-development
description: Fluxo normal de desenvolvimento do Sistema_Pedidos_Radial — use para implementar features/fixes de escopo claro até o report de PRONTO PARA TESTE MANUAL.
---

# radial-fast-development

Fluxo: entender escopo → implementar autonomamente → testes focados → TypeScript (`tsc --noEmit`) → diff check → reportar `PRONTO PARA TESTE MANUAL`.

## Regras

- 1 agente principal; sem subagentes, review independente ou múltiplas auto-revisões por padrão.
- Sem suíte completa e sem Playwright completo por padrão; testes proporcionais ao risco.
- TDD focado para comportamento novo/bug.
- Não interromper o usuário por decisões técnicas internas já cobertas pelo escopo.
- Interromper apenas para decisão material nova: UX, negócio, dados, permissão, escopo ou ação destrutiva.
- Nível de raciocínio: o menor suficiente (rotineira/bounded = Low ou equivalente; complexidade relevante = High ou equivalente); não depender de nome de nível fixo.
- Antes de encerrar, revisar o próprio diff: escopo, resíduos de debug, secrets.
- Termina sempre em `PRONTO PARA TESTE MANUAL`; sem commit/push antes da aprovação manual, salvo autorização explícita.
