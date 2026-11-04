import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles.ts';

type Props = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

/** Um link com cara de botão: navegação continua sendo navegação (abre em nova aba, histórico, leitor de tela). */
export function ButtonLink({ variant = 'primary', size = 'lg', className, ...rest }: Props) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
