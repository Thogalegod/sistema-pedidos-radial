# Próximos passos - Manutenção preventiva de cabine

## Onde paramos

Estamos estruturando o novo fluxo de **Relatórios Técnicos > Cabine Primária > Manutenção Preventiva Completa**.

O objetivo é que o relatório completo nasça assim:

1. Cadastrar/abrir cliente e cabine.
2. Escolher tipo da cabine: convencional ou simplificada.
3. Dentro da cabine, cadastrar os equipamentos existentes.
4. Criar uma manutenção anual a partir da cabine cadastrada.
5. Adicionar fichas internas dos equipamentos inspecionados.
6. Gerar o relatório completo da manutenção preventiva com capa, índice, resumo de ocorrências, fichas, fotos, conclusão e anexos.

## O que foi feito

- Hub reorganizado para ter **Controle de Pedidos** e **Relatórios Técnicos**.
- Relatórios Técnicos agora tem **Cabine Primária**, **Transformador** e **Termografia**.
- Cabine Primária agora tem:
  - **Inspeção Cabine (Concessionária)**, que aponta para o módulo atual.
  - **Manutenção Preventiva Completa**, novo esqueleto.
- Manutenção Preventiva Completa agora mostra:
  - Novo cliente / nova cabine.
  - Clientes / cabines cadastradas.
  - Esqueleto do relatório.
  - Equipamentos da cabine dentro da manutenção.
  - Plano de ação.
- Criada a primeira ficha interna: **Ficha do Transformador**.
- A ficha do transformador tem tela de preenchimento com:
  - Fotos da placa e equipamento.
  - Informações gerais.
  - Seleções de A.T., B.T., classe de isolação, refrigeração e tap de despacho.
  - Inspeção visual com C / N/A / N/C colorido.
  - Resistência de isolamento.
  - Relação de transformação.
  - Resistência dos enrolamentos.
  - Análise de óleo quando aplicável.
  - Ocorrências em lista.
  - Comentários internos.
- O botão **Gerar ficha completa** abre uma rota de visualização:
  - `/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-transformador/visualizar`
- Essa visualização já tem páginas A4, cabeçalho, índice, gráficos e botão de imprimir/PDF.

## Importante

A ficha final do transformador **ainda está ruim visualmente**. Ela é só o começo técnico da separação correta entre:

- tela de preenchimento em campo;
- visualização final paginada da ficha.

Não considerar o layout atual como aprovado.

## Próximo passo recomendado

Melhorar a ficha final do transformador para ficar parecida com o PDF modelo `Transformador.pdf`:

1. Ajustar capa da ficha do equipamento.
2. Ajustar cabeçalho/rodapé em todas as páginas.
3. Melhorar paginação e espaçamento.
4. Melhorar tabelas para ficarem com aparência técnica de relatório.
5. Revisar gráficos e onde eles entram.
6. Ajustar fotos para ficarem no padrão do relatório.
7. Remover qualquer visual de app/web da folha final.
8. Depois disso, implementar salvar ficha.

## Lembrete para retomada

Se o usuário pedir qualquer tarefa futura sem contexto, lembrar:

> Paramos na criação do fluxo de Manutenção Preventiva Completa da Cabine Primária. A próxima implementação combinada é melhorar o layout final paginado da ficha do transformador, porque a estrutura existe, mas o visual ainda precisa ficar no padrão do relatório técnico modelo.
