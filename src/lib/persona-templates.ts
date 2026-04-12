import type { Persona } from '../types/persona.js';
import { PERSONA_TEMPLATES } from '../templates/personas.js';

export function listPersonaTemplates(): Persona[] {
  return PERSONA_TEMPLATES
    .map((persona) => structuredClone(persona))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getPersonaTemplate(templateId: string): Persona {
  const template = PERSONA_TEMPLATES.find((persona) => persona.id === templateId);
  if (!template) {
    throw new Error(`Unknown persona template: "${templateId}"\nRun 'personascout persona list --templates' to see available templates.`);
  }

  return structuredClone(template);
}
