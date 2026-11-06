import { describe, expect, it } from 'vitest';
import {
  googleMapsUrl,
  isShortMapsLink,
  parseMapsLink,
  telUrl,
  wazeUrl,
  whatsappUrl,
} from './index.ts';

describe('parseMapsLink', () => {
  it('lê o @lat,lng da câmera', () => {
    expect(
      parseMapsLink('https://www.google.com/maps/place/Park+Salto+Ventoso/@-29.2241,-51.3451,15z'),
    ).toEqual({ lat: -29.2241, lng: -51.3451 });
  });

  it('prefere o pino !3d!4d ao @ da câmera', () => {
    expect(
      parseMapsLink(
        'https://www.google.com/maps/place/Casa+Valduga/@-29.19,-51.56,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-29.1934!4d-51.5577!16s',
      ),
    ).toEqual({ lat: -29.1934, lng: -51.5577 });
  });

  it('lê ?q=lat,lng, loc: e ll=', () => {
    expect(parseMapsLink('https://maps.google.com/?q=-26.3786,-50.1433')).toEqual({
      lat: -26.3786,
      lng: -50.1433,
    });
    expect(parseMapsLink('https://maps.google.com/?q=loc:-26.3786,-50.1433')).toEqual({
      lat: -26.3786,
      lng: -50.1433,
    });
    expect(parseMapsLink('https://maps.google.com/maps?ll=-26.3786,-50.1433&z=12')).toEqual({
      lat: -26.3786,
      lng: -50.1433,
    });
    expect(
      parseMapsLink('https://www.google.com/maps/dir/?api=1&destination=-26.3786%2C-50.1433'),
    ).toEqual({ lat: -26.3786, lng: -50.1433 });
  });

  it('lê /place/lat,lng e coordenada pura', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/-26.3786,-50.1433')).toEqual({
      lat: -26.3786,
      lng: -50.1433,
    });
    expect(parseMapsLink(' -26.3786, -50.1433 ')).toEqual({ lat: -26.3786, lng: -50.1433 });
  });

  it('recusa o que não é coordenada', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/Gramado')).toBeNull();
    expect(parseMapsLink('Rua Cel. Theobaldo Fleck, 15')).toBeNull();
    expect(parseMapsLink('https://maps.google.com/?q=120,-50')).toBeNull();
    expect(parseMapsLink('')).toBeNull();
  });

  it('identifica links curtos', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/AbCdEf')).toBe(true);
    expect(isShortMapsLink('https://goo.gl/maps/AbCdEf')).toBe(true);
    expect(isShortMapsLink('https://www.google.com/maps/place/x/@-1,-2,15z')).toBe(false);
  });
});

describe('deep links', () => {
  const withCoords = { lat: -29.2241, lng: -51.3451, name: 'Salto Ventoso', address: null };
  const withAddress = {
    lat: null,
    lng: null,
    name: 'Hotel',
    address: 'R. Cel. Theobaldo Fleck, 15',
  };
  const nameOnly = { lat: null, lng: null, name: 'Gramado', address: null };
  const empty = { lat: null, lng: null, name: ' ', address: null };

  it('usa lat/lng quando existe', () => {
    expect(googleMapsUrl(withCoords)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-29.2241%2C-51.3451',
    );
    expect(wazeUrl(withCoords)).toBe('https://waze.com/ul?ll=-29.2241,-51.3451&navigate=yes');
  });

  it('senão o endereço, senão o nome', () => {
    expect(googleMapsUrl(withAddress)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=R.%20Cel.%20Theobaldo%20Fleck%2C%2015',
    );
    expect(wazeUrl(nameOnly)).toBe('https://waze.com/ul?q=Gramado&navigate=yes');
  });

  it('sem nada, sem link', () => {
    expect(googleMapsUrl(empty)).toBeNull();
    expect(wazeUrl(empty)).toBeNull();
  });
});

describe('ligar e WhatsApp', () => {
  it('tel: com o E.164 e wa.me só com os dígitos', () => {
    expect(telUrl('+5551997527596')).toBe('tel:+5551997527596');
    expect(whatsappUrl('+5551997527596')).toBe('https://wa.me/5551997527596');
  });
});
