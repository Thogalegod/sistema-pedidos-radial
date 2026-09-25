import { describe, expect, it } from 'vitest';
import { templateDefinitionSchema, type TemplateDefinition } from './template-schema';

function definition(): TemplateDefinition {
  return {
    schemaVersion: 1,
    fronts: [{ key: 'geral', name: 'Geral', position: 0 }],
    tasks: [
      { key: 'levantamento', frontKey: 'geral', title: 'Levantamento', description: null,
        priority: 'Normal', dueRule: { kind: 'creation', offsetDays: 0 }, followUpRule: null },
      { key: 'entrega', frontKey: 'geral', title: 'Entrega', description: 'Entregar ao cliente',
        priority: 'Alta', dueRule: { kind: 'completion', sourceTaskKey: 'levantamento', offsetDays: 2 },
        followUpRule: null },
    ],
    subtasks: [{ key: 'conferir', taskKey: 'entrega', title: 'Conferir', priority: null,
      dueRule: { kind: 'creation', offsetDays: 1 } }],
    dependencies: [{ taskKey: 'entrega', predecessorKey: 'levantamento' }],
  };
}

describe('templateDefinitionSchema', () => {
  it('accepts a valid versioned blueprint', () => {
    expect(templateDefinitionSchema.parse(definition())).toEqual(definition());
  });

  it('rejects missing references and duplicate entity keys', () => {
    const missingFront = definition();
    missingFront.tasks[0].frontKey = 'missing';
    expect(templateDefinitionSchema.safeParse(missingFront).success).toBe(false);

    const missingTask = definition();
    missingTask.subtasks[0].taskKey = 'missing';
    expect(templateDefinitionSchema.safeParse(missingTask).success).toBe(false);

    const duplicate = definition();
    duplicate.tasks.push({ ...duplicate.tasks[0] });
    expect(templateDefinitionSchema.safeParse(duplicate).success).toBe(false);
  });

  it('rejects invalid offsets and unresolved completion sources', () => {
    const negative = definition();
    negative.tasks[0].dueRule = { kind: 'creation', offsetDays: -1 };
    expect(templateDefinitionSchema.safeParse(negative).success).toBe(false);

    const fractional = definition();
    fractional.tasks[0].dueRule = { kind: 'creation', offsetDays: 1.5 };
    expect(templateDefinitionSchema.safeParse(fractional).success).toBe(false);

    const missingSource = definition();
    missingSource.tasks[1].dueRule = { kind: 'completion', sourceTaskKey: 'missing', offsetDays: 1 };
    expect(templateDefinitionSchema.safeParse(missingSource).success).toBe(false);
  });

  it('rejects dependency cycles and completion-rule cycles', () => {
    const dependencyCycle = definition();
    dependencyCycle.dependencies.push({ taskKey: 'levantamento', predecessorKey: 'entrega' });
    expect(templateDefinitionSchema.safeParse(dependencyCycle).success).toBe(false);

    const ruleCycle = definition();
    ruleCycle.tasks[0].dueRule = {
      kind: 'completion', sourceTaskKey: 'entrega', offsetDays: 1,
    };
    expect(templateDefinitionSchema.safeParse(ruleCycle).success).toBe(false);
  });
});
