import { Camera, FileUp, Images } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/Button.tsx';

type Props = {
  /** `photo`: tirar foto ou escolher da galeria; `document`: tirar foto (print) ou escolher arquivo */
  mode: 'photo' | 'document';
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** quantos ainda cabem (as fotos da memória): escolher vários respeita o limite */
  remaining?: number;
};

/**
 * Os dois botões de mídia. A câmera usa `capture="environment"`; a galeria e o arquivo, o seletor do
 * sistema. No iPhone, o Safari entrega a foto em JPEG mesmo quando ela está guardada em HEIC.
 */
export function FilePickers({ mode, onFiles, disabled = false, remaining }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pick = (input: HTMLInputElement | null) => {
    if (!input) return;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    onFiles(remaining === undefined ? files : files.slice(0, Math.max(0, remaining)));
  };
  const second = mode === 'photo' ? 'Da galeria' : 'Escolher arquivo';
  const SecondIcon = mode === 'photo' ? Images : FileUp;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="secondary"
        size="md"
        disabled={disabled}
        onClick={() => camera.current?.click()}
      >
        <Camera className="size-5" aria-hidden="true" />
        Tirar foto
      </Button>
      <Button
        variant="secondary"
        size="md"
        disabled={disabled}
        onClick={() => picker.current?.click()}
      >
        <SecondIcon className="size-5" aria-hidden="true" />
        {second}
      </Button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Tirar foto"
        onChange={(e) => pick(e.currentTarget)}
      />
      <input
        ref={picker}
        type="file"
        accept={mode === 'photo' ? 'image/*' : 'image/*,application/pdf'}
        multiple
        hidden
        aria-label={second}
        onChange={(e) => pick(e.currentTarget)}
      />
    </div>
  );
}
