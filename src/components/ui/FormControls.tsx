import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  labelAction?: ReactNode;
  children: ReactNode;
}

export function FormField({
  id,
  label,
  required,
  hint,
  error,
  labelAction,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <label htmlFor={id} className="block text-sm font-medium text-[#18181B]">
            {label}
          </label>
          {required && (
            <span className="text-sm font-medium text-[#991B1B]" aria-hidden="true">
              *
            </span>
          )}
        </div>
        {labelAction}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-[#52525B]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  );
}

const INPUT_BASE =
  'min-h-[44px] w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#52525B]/60 transition-colors disabled:cursor-not-allowed disabled:bg-[#F4F5F7] disabled:text-[#52525B]';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  mono?: boolean;
}

export function Input({ hasError = false, mono = false, className = '', ...rest }: InputProps) {
  return (
    <input
      aria-invalid={hasError || undefined}
      className={`${INPUT_BASE} ${
        hasError ? 'border-[#DC2626]' : 'border-[#E4E4E7]'
      } ${mono ? 'font-mono-tabular text-xs' : ''} ${className}`}
      {...rest}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  children: ReactNode;
}

export function Select({ hasError = false, className = '', children, ...rest }: SelectProps) {
  return (
    <select
      aria-invalid={hasError || undefined}
      className={`${INPUT_BASE} ${hasError ? 'border-[#DC2626]' : 'border-[#E4E4E7]'} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export function Textarea({ hasError = false, className = '', ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={hasError || undefined}
      className={`min-h-[88px] w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-[#52525B]/60 disabled:cursor-not-allowed disabled:bg-[#F4F5F7] ${
        hasError ? 'border-[#DC2626]' : 'border-[#E4E4E7]'
      } ${className}`}
      {...rest}
    />
  );
}

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string;
  label: ReactNode;
  description?: string;
  error?: string;
}

export function CheckboxField({
  id,
  label,
  description,
  error,
  className = '',
  ...rest
}: CheckboxFieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1 text-sm text-[#18181B]"
      >
        <input
          id={id}
          type="checkbox"
          aria-invalid={Boolean(error) || undefined}
          className="mt-1 h-4 w-4 shrink-0 rounded border-[#E4E4E7] accent-[#991B1B]"
          {...rest}
        />
        <span>
          <span className="font-medium text-[#18181B]">{label}</span>
          {description && (
            <span className="mt-0.5 block text-xs leading-relaxed text-[#52525B]">
              {description}
            </span>
          )}
        </span>
      </label>
      {error && <p className="mt-1 text-xs font-medium text-[#DC2626]">{error}</p>}
    </div>
  );
}
