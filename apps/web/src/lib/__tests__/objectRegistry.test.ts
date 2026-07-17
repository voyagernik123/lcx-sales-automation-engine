import { describe, expect, it } from 'vitest';
import { INSPECTOR_TO_OBJECT, OBJECT_TYPES, type ObjectType } from '../objectRegistry';

describe('object registry', () => {
  const types = Object.keys(OBJECT_TYPES) as ObjectType[];

  it('defines all 11 object types of the ontology', () => {
    expect(types).toHaveLength(11);
  });

  it('every type resolves to a workspace route — no dead entity names', () => {
    for (const t of types) {
      const def = OBJECT_TYPES[t];
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.route('some-id')).toMatch(/^\//);
    }
  });

  it('every inspector payload type maps back to an object type', () => {
    for (const [inspector, objectType] of Object.entries(INSPECTOR_TO_OBJECT)) {
      expect(OBJECT_TYPES[objectType as ObjectType].inspector).toBe(inspector);
    }
  });

  it('contact routes derive the project workspace from the composite id', () => {
    expect(OBJECT_TYPES.contact.route('proj-1:person-2')).toBe('/bd-pipeline/proj-1');
  });
});
