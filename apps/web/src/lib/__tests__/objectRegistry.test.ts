import { describe, expect, it } from 'vitest';
import { INSPECTOR_TO_OBJECT, OBJECT_TYPES, type ObjectType } from '../objectRegistry';

describe('object registry', () => {
  const types = Object.keys(OBJECT_TYPES) as ObjectType[];

  it('defines all 18 object types of the ontology (11 sales/regulatory + 7 from S5: gps and marketing)', () => {
    expect(types).toHaveLength(18);
  });

  it('every type resolves to a workspace route — no dead entity names', () => {
    for (const t of types) {
      const def = OBJECT_TYPES[t];
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.route('some-id')).toMatch(/^\//);
    }
  });

  it('every type is L3-capable — the inspector is generalized to all 18', () => {
    for (const t of types) {
      expect(OBJECT_TYPES[t].inspector, `${t} must have an inspector payload`).toBeDefined();
    }
  });

  it('every inspector payload type maps back to an object type', () => {
    for (const [inspector, objectType] of Object.entries(INSPECTOR_TO_OBJECT)) {
      expect(OBJECT_TYPES[objectType as ObjectType].inspector).toBe(inspector);
    }
  });

  it('contact routes to its own workspace with the composite id', () => {
    expect(OBJECT_TYPES.contact.route('proj-1:person-2')).toBe('/contacts/proj-1:person-2');
  });
});
