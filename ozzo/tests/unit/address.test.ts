import { buildAddress, type AddressInput, normalizePostalCode, normalizeTaxId, ValidationError } from '../../src/domain';

describe('postal code normalization', () => {
  it.each([
    ['US', '12345', '12345'],
    ['US', ' 12345-6789 ', '12345-6789'],
    ['CA', 't2p1j9', 'T2P 1J9'],
    ['CA', 'T2P1J9', 'T2P 1J9'],
    ['UK', 'sw1a1aa', 'SW1A 1AA'],
    ['UK', 'M1 1AE', 'M1 1AE'],
    ['UK', 'EC1A 1BB', 'EC1A 1BB'],
  ] as const)('%s %s -> %s', (region, raw, expected) => {
    expect(normalizePostalCode(raw, region)).toBe(expected);
  });

  it.each([
    ['US', '1234'],
    ['US', '12345-678'],
    ['US', 'T2P 1J9'],
    ['CA', '12345'],
    ['CA', 'D2P 1J9'], // D is never valid
    ['CA', 'W2P 1J9'], // W is not a valid first letter
    ['UK', '12345'],
    ['UK', 'SW1A 1CC'], // C is not a valid inward letter
  ] as const)('rejects %s %s', (region, raw) => {
    expect(() => normalizePostalCode(raw, region)).toThrow(ValidationError);
  });
});

describe('buildAddress', () => {
  it('normalizes fields per region', () => {
    expect(
      buildAddress({ street: '  1   Main  St ', city: ' Calgary', stateProvince: 'ab', country: 'ca', postalCode: 't2p1j9' }),
    ).toEqual({ street: '1 Main St', city: 'Calgary', stateProvince: 'AB', country: 'CA', postalCode: 'T2P 1J9' });
  });

  it('keeps UK county as free text', () => {
    expect(
      buildAddress({ street: '10 Downing St', city: 'London', stateProvince: 'Greater London', country: 'UK', postalCode: 'sw1a2aa' })
        .stateProvince,
    ).toBe('Greater London');
  });

  it.each([
    ['unknown country', { country: 'FR' } as Partial<AddressInput>],
    ['province not in US', { stateProvince: 'AB' }],
    ['state not in CA', { country: 'CA', stateProvince: 'TX', postalCode: 'T2P 1J9' }],
    ['blank street', { street: '  ' }],
  ])('rejects %s', (_n, override: Partial<AddressInput>) => {
    const base: AddressInput = { street: '1 Main', city: 'X', stateProvince: 'TX', country: 'US', postalCode: '12345' };
    expect(() =>
      buildAddress({ ...base, ...override }),
    ).toThrow(ValidationError);
  });
});

describe('normalizeTaxId', () => {
  it('accepts a Luhn-valid SIN with separators', () => {
    expect(normalizeTaxId('130-692-544', 'CA')).toBe('130692544');
  });
  it.each(['130692545', '123456789', '12345678', '046454286'])('rejects invalid SIN %s', (v) => {
    expect(() => normalizeTaxId(v, 'CA')).toThrow(ValidationError);
  });
  it('accepts a plausible SSN and rejects reserved ranges', () => {
    expect(normalizeTaxId('123-45-6789', 'US')).toBe('123456789');
    for (const v of ['000-12-3456', '666-12-3456', '900-12-3456', '123-00-4567', '123-45-0000']) {
      expect(() => normalizeTaxId(v, 'US')).toThrow(ValidationError);
    }
  });
  it('is not supported for UK', () => {
    expect(() => normalizeTaxId('123456789', 'UK')).toThrow(ValidationError);
  });
});
