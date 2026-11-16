import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CODE_LEN, cleanCode, hashToken, restTurnCredentials } from '../src/security.js';

describe('kod miestnosti', () => {
  it('ma 6 pismen, stare 4-pismenove kody ostavaju platne, ostatne znaky sa zahodia', () => {
    expect(CODE_LEN).toBe(6);
    expect(cleanCode('abcdefgh')).toBe('ABCDEF');
    expect(cleanCode('ab-12 cd')).toBe('ABCD');
    expect(cleanCode(42)).toBe('');
  });
});

describe('hash tokenu', () => {
  it('je stabilny, 64 hex znakov a neprezradi token', () => {
    const t = '0123456789abcdef0123456789abcdef';
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).not.toBe(hashToken(t.replace('0', '1')));
  });
});

describe('kratkodobe TURN udaje', () => {
  it('meno obsahuje cas expiracie a heslo je HMAC-SHA1 mena (coturn use-auth-secret)', () => {
    const now = 1_700_000_000_000;
    const c = restTurnCredentials('tajomstvo', now, 3600);
    expect(c.username).toBe(`${1_700_000_000 + 3600}:bang`);
    expect(c.credential).toBe(createHmac('sha1', 'tajomstvo').update(c.username).digest('base64'));
  });
  it('rozne tajomstvo da ine heslo', () => {
    const a = restTurnCredentials('a', 1_700_000_000_000);
    const b = restTurnCredentials('b', 1_700_000_000_000);
    expect(a.credential).not.toBe(b.credential);
  });
});
