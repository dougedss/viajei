import { deliverFile, type FileDelivery } from '@/lib/files/deliver.ts';
import { ICS_MIME } from './ics.ts';

/** Entrega do `.ics`: folha de compartilhar no celular, download no resto (`lib/files`). */
export type IcsDelivery = FileDelivery;

export function deliverIcs(text: string, filename: string, title: string): Promise<IcsDelivery> {
  return deliverFile(text, filename, ICS_MIME, title);
}
