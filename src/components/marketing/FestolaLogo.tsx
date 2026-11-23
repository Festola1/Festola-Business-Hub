import { Link } from 'react-router';

interface FestolaLogoProps {
  /** 'dark' for light backgrounds, 'light' for dark footer backgrounds */
  variant?: 'dark' | 'light';
  /** Show tagline under the brand lockup */
  showTagline?: boolean;
  /** Optional click handler (e.g., closing mobile drawer) */
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function FestolaLogo({
  variant = 'dark',
  showTagline = false,
  onClick,
  size = 'md',
}: FestolaLogoProps) {
  const isLight = variant === 'light';
  const boxSize = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10';
  const iconSize = size === 'sm' ? 20 : 22;

  return (
    <Link
      to="/"
      onClick={onClick}
      className="group inline-flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D90000]"
      aria-label="Festola Business Hub — Home"
    >
      <span
        className={`relative flex ${boxSize} shrink-0 items-center justify-center rounded-xl bg-[#D90000] text-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.03]`}
        aria-hidden="true"
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Crisp stylized F monogram with upward growth stroke */}
          <path
            d="M7 6.5C7 5.67157 7.67157 5 8.5 5H21.5C22.3284 5 23 5.67157 23 6.5V7.75C23 8.57843 22.3284 9.25 21.5 9.25H11.5V12.5H19.25C20.0784 12.5 20.75 13.1716 20.75 14V15C20.75 15.8284 20.0784 16.5 19.25 16.5H11.5V21.5C11.5 22.3284 10.8284 23 10 23H8.5C7.67157 23 7 22.3284 7 21.5V6.5Z"
            fill="currentColor"
          />
          <circle cx="20.5" cy="20.5" r="2.25" fill="currentColor" fillOpacity="0.9" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={`font-bold tracking-tight ${
            size === 'sm' ? 'text-base' : 'text-[17px]'
          } ${isLight ? 'text-white' : 'text-[#151B2B]'}`}
        >
          <span className={isLight ? 'text-[#FF4D4D]' : 'text-[#D90000]'}>Festola</span>{' '}
          <span>Business Hub</span>
        </span>
        {showTagline && (
          <span
            className={`mt-1 text-[11px] font-medium tracking-wide ${
              isLight ? 'text-slate-300' : 'text-[#5A6478]'
            }`}
          >
            Manage. Grow. Succeed.
          </span>
        )}
      </span>
    </Link>
  );
}
