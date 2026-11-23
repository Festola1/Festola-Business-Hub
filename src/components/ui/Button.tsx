import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[#991B1B] text-white hover:bg-[#7F1D1D] border border-transparent',
  secondary: 'bg-white text-[#18181B] border border-[#E4E4E7] hover:bg-[#F4F5F7]',
  ghost:
    'bg-transparent text-[#52525B] border border-transparent hover:bg-[#F4F5F7] hover:text-[#18181B]',
  danger: 'bg-white text-[#DC2626] border border-[#DC2626] hover:bg-[#FEF2F2]',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'min-h-[40px] px-3.5 py-2 text-xs',
  md: 'min-h-[44px] px-4 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (loadingLabel ?? 'Working...') : children}
    </button>
  );
}
