/**
 * "Procurar hotel perto de <parada>" (fase 18): um link para a busca do Booking.com com o lugar e as
 * datas, sem API e sem chave. A forma dos parâmetros não está documentada pelo Booking; foi conferida
 * no navegador em 20/11/2026 (`searchresults.pt-br.html` com `ss`, `checkin`, `checkout`,
 * `group_adults`, `no_rooms` e `lang` abriu Canela com as datas e a ocupação certas). Puro, sem React.
 */
export type HotelSearch = {
  /** o lugar, como a pessoa o leria: o endereço da parada, ou o nome e a cidade */
  place: string;
  /** AAAA-MM-DD */
  checkin: string;
  /** AAAA-MM-DD; sem ele, o dia seguinte ao check-in */
  checkout?: string | null;
  /** quantas pessoas; o padrão do Booking é 2 */
  adults?: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** O dia seguinte a uma data AAAA-MM-DD, sem fuso (só aritmética de calendário). */
export function nextDay(date: string): string {
  const t = Date.parse(`${date}T12:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** O link da busca; null sem lugar ou com data fora do formato. */
export function bookingSearchUrl(search: HotelSearch): string | null {
  const place = search.place.trim();
  if (place === '' || !DATE.test(search.checkin)) return null;
  const checkout =
    search.checkout && DATE.test(search.checkout) ? search.checkout : nextDay(search.checkin);
  if (checkout <= search.checkin) return null;
  const url = new URL('https://www.booking.com/searchresults.pt-br.html');
  url.searchParams.set('ss', place);
  url.searchParams.set('checkin', search.checkin);
  url.searchParams.set('checkout', checkout);
  url.searchParams.set(
    'group_adults',
    String(Math.min(30, Math.max(1, Math.round(search.adults ?? 2)))),
  );
  url.searchParams.set('no_rooms', '1');
  url.searchParams.set('lang', 'pt-br');
  return url.toString();
}
