import { Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

export default function NotFoundPage() {
  const { session, activeMembership } = useAuth();
  const returnPath = session ? (activeMembership ? '/app/dashboard' : '/onboarding') : '/';
  const returnLabel = session
    ? activeMembership
      ? 'Return to dashboard'
      : 'Continue business setup'
    : 'Return to home page';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] px-4 py-12 text-[#18181B]">
      <main className="w-full max-w-md rounded-lg border border-[#E4E4E7] bg-white p-6 sm:p-8">
        <p className="font-mono-tabular text-xs font-semibold text-[#991B1B]">
          404 · Page not found
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#18181B]">
          We could not find that page
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#52525B]">
          The link may have expired or the page may have moved. Use the button below to return to a
          valid Festola Business Hub screen.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={returnPath}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#991B1B] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#7F1D1D]"
          >
            {returnLabel}
          </Link>
          {!session && (
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#E4E4E7] bg-white px-5 py-2.5 text-sm font-medium text-[#18181B] transition-colors hover:bg-[#F4F5F7]"
            >
              Sign in
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
