import type { StickerKey } from './placement.ts';

/**
 * A arte dos adesivos, própria, numa caixa de 24 × 24 (y para baixo, como no SVG): um disco com
 * aro e um desenho de traço. As mesmas strings de path viram `<path>` na vista lateral e `Path2D`
 * na textura do 3D, então os dois mostram o mesmo adesivo.
 */
export type StickerArt = {
  bg: string;
  ring: string;
  ink: string;
  /** traços (stroke) */
  strokes: readonly string[];
  /** preenchimentos com a tinta */
  fills: readonly string[];
  /** preenchimentos claros por cima (neve na serra) */
  highlights: readonly string[];
};

const dot = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

export const STICKER_ART: Record<StickerKey, StickerArt> = {
  sticker_clock: {
    bg: '#F1EEE7',
    ring: '#1F9A66',
    ink: '#1C2230',
    strokes: [dot(12, 12, 7.6), 'M12 7.6v4.8l3.2 2'],
    fills: [],
    highlights: [],
  },
  sticker_waterfall: {
    bg: '#DDEFF5',
    ring: '#2F8FC9',
    ink: '#2F7FB3',
    strokes: [
      'M4 6.8h9a3 3 0 0 1 3 3v1',
      'M7.4 6.8v8.6',
      'M10.4 6.8v10.2',
      'M13.4 9v6.6',
      'M4 19.4c1.6-1.2 3.4-1.2 5 0s3.4 1.2 5 0 3.4-1.2 5 0',
    ],
    fills: [],
    highlights: [],
  },
  sticker_grapes: {
    bg: '#EFE7F7',
    ring: '#6D4BA3',
    ink: '#6D4BA3',
    strokes: ['M12 8.2V5.4c1-1.4 2.4-1.9 3.8-1.5'],
    fills: [
      dot(8.6, 10.2, 1.9),
      dot(12, 10.2, 1.9),
      dot(15.4, 10.2, 1.9),
      dot(10.3, 13.5, 1.9),
      dot(13.7, 13.5, 1.9),
      dot(12, 16.8, 1.9),
      'M12 6.2c-1.9-1.9-4.4-1.7-5.4-.5 1.5 1.3 3.7 1.5 5.4.5Z',
    ],
    highlights: [],
  },
  sticker_camera: {
    bg: '#F1EEE7',
    ring: '#3B4250',
    ink: '#1C2230',
    strokes: ['M4 8.6h3.2l1.6-2.4h6.4l1.6 2.4H20V18H4Z', dot(12, 13.2, 3.1)],
    fills: [dot(17.2, 10.8, 0.7)],
    highlights: [],
  },
  sticker_star: {
    bg: '#FFF4D6',
    ring: '#E9C24A',
    ink: '#D9922F',
    strokes: [],
    fills: ['M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8Z'],
    highlights: [],
  },
  sticker_map: {
    bg: '#E8F2E6',
    ring: '#3E9D5A',
    ink: '#357F4B',
    strokes: ['M3.6 6.6 9 4.6l6 2 5.4-2v12.8l-5.4 2-6-2-5.4 2Z', 'M9 4.6v12.8', 'M15 6.6v12.8'],
    fills: [],
    highlights: [],
  },
  sticker_mountains: {
    bg: '#F6DCC5',
    ring: '#E8653A',
    ink: '#3B4250',
    strokes: [],
    fills: ['M2.6 18.4 9 8.2l3.4 5.4 2.6-3.6 6.4 8.4Z'],
    highlights: ['M9 8.2l2 3.2-1.2-.7-.8 1-.8-1-1.2.7Z'],
  },
};

/** Espessura do traço e do aro na caixa de 24. */
export const STICKER_STROKE = 1.9;
export const STICKER_RING = 1.6;
