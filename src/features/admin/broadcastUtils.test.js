import { describe, it, expect } from 'vitest';
import { parseRecipients } from './broadcastUtils';

describe('parseRecipients', () => {
  it('splitter på komma, semikolon, mellemrum og linjeskift', () => {
    const { valid } = parseRecipients('a@x.dk, b@x.dk; c@x.dk\nd@x.dk e@x.dk');
    expect(valid).toEqual(['a@x.dk', 'b@x.dk', 'c@x.dk', 'd@x.dk', 'e@x.dk']);
  });

  it('skiller gyldige fra ugyldige', () => {
    const { valid, invalid } = parseRecipients('ok@x.dk, ikke-en-mail, mangler@');
    expect(valid).toEqual(['ok@x.dk']);
    expect(invalid).toEqual(['ikke-en-mail', 'mangler@']);
  });

  it('dedupliker uafhængigt af store/små bogstaver', () => {
    const { valid } = parseRecipients('Mor@X.dk, mor@x.dk, MOR@x.DK');
    expect(valid).toEqual(['Mor@X.dk']);
  });

  it('tom/whitespace giver tomme lister', () => {
    expect(parseRecipients('   \n ')).toEqual({ valid: [], invalid: [] });
    expect(parseRecipients('')).toEqual({ valid: [], invalid: [] });
  });
});
