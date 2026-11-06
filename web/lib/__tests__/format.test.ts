import { describe, expect, it } from 'vitest';
import { countryDisplay } from '@/lib/format';

describe('countryDisplay', () => {
  it('convierte ISO alpha-2 en bandera y nombre de país en español', () => {
    // Intl usa el nombre largo en español para HK.
    expect(countryDisplay('HK')).toEqual({ flag: '🇭🇰', label: 'RAE de Hong Kong (China)' });
    expect(countryDisplay('us')).toEqual({ flag: '🇺🇸', label: 'Estados Unidos' });
  });

  it('etiqueta LAN como red local', () => {
    expect(countryDisplay('LAN')).toEqual({ flag: '🏠', label: 'Red local' });
    expect(countryDisplay('lan')).toEqual({ flag: '🏠', label: 'Red local' });
  });

  it('trata null/vacío como sin geolocalizar', () => {
    expect(countryDisplay(null)).toEqual({ flag: '🌐', label: 'Sin geolocalizar' });
    expect(countryDisplay(undefined)).toEqual({ flag: '🌐', label: 'Sin geolocalizar' });
    expect(countryDisplay('  ')).toEqual({ flag: '🌐', label: 'Sin geolocalizar' });
  });
});
