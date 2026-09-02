import { describe, expect, it } from 'vitest';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { promptsFor, verbsFor } from '../grammar';

/**
 * A PARTNER'S COMMERCIAL TERMS CAN BE RECORDED FROM THE COMMAND LINE (TERMINAL open item 4, 2026-09-02).
 *
 * The practice range taught that "the commercial VALUES cannot be filled from the keyboard path at
 * all". That was true of `command_rfi_record`, which writes the RFI's status and nothing else — and
 * it stayed written after `command_set_partner_details` landed in the registry with two free-text
 * params. The keyboard path is: ⌘K → the partner (the `command_partners` search group emits the
 * `command_partner` noun) → "Set partner contact/terms" → the two values typed inline in the verb
 * panel → Enter. This pins each link of that path from the manifest and the grammar, so the sentence
 * the practice range now teaches cannot drift back to false without this going red.
 */
const partnerNoun = { type: 'command_partner', id: 'p-1', label: 'Copper (custody RFI)', state: { stage: 'diligence' } };
const operator = { role: 'operator' as const, entitlements: { command: 'operate' as const } };

describe('recording a partner’s terms from the keyboard', () => {
  it('the partner noun offers "Set partner contact/terms" to an operator holding COMMAND at operate', () => {
    const verbs = verbsFor(ACTION_MANIFEST, partnerNoun, operator);
    const terms = verbs.find((v) => v.action.id === 'command_set_partner_details');
    expect(terms, 'the verb is not offered on a command_partner noun').toBeDefined();
    expect(terms!.blocked).toBeNull();
  });

  it('the verb prompts for the two values as free text, typed inline — no record editor, no window.prompt', () => {
    const action = ACTION_MANIFEST.actions.find((a) => a.id === 'command_set_partner_details')!;
    const prompts = promptsFor(action, ACTION_MANIFEST.valueSets);
    expect(prompts.map((p) => [p.name, p.type, p.kind])).toEqual(
      expect.arrayContaining([['primaryContact', 'string', 'value'], ['terms', 'string', 'value']]),
    );
    expect(prompts.every((p) => p.kind !== 'record')).toBe(true);
  });

  it('the RFI record verb itself carries no terms field — the status write and the values write are two verbs, by design', () => {
    const rfi = ACTION_MANIFEST.actions.find((a) => a.id === 'command_rfi_record');
    expect(rfi).toBeDefined();
    expect(Object.keys(rfi!.params.properties ?? {})).not.toContain('terms');
  });
});
