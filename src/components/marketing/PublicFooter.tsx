import { Link } from 'react-router';
import { Mail, MapPin, Smartphone } from 'lucide-react';
import { FestolaLogo } from './FestolaLogo';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#232A3E] bg-[#151B2B] text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand Column */}
          <div className="lg:col-span-4">
            <FestolaLogo variant="light" showTagline />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
              A complete business management and POS platform built for Nigerian SMEs and growing
              businesses across Africa. Manage sales, inventory, customers, expenses, and profits
              from Web, Android, and iOS.
            </p>
            <div className="mt-5 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 shrink-0 text-[#FF4D4D]" aria-hidden="true" />
                <span>Installable PWA for Web, Android &amp; iOS</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[#FF4D4D]" aria-hidden="true" />
                <span>Built for Nigerian SMEs &amp; expanding across Africa</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-[#FF4D4D]" aria-hidden="true" />
                <a
                  href="mailto:support@festolabusinesshub.com"
                  className="transition-colors hover:text-white"
                >
                  support@festolabusinesshub.com
                </a>
              </div>
            </div>
          </div>

          {/* Product Column */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Product</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/features" className="transition-colors hover:text-white">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="transition-colors hover:text-white">
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  to="/how-it-works#product-preview"
                  className="transition-colors hover:text-white"
                >
                  Dashboard Preview
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="transition-colors hover:text-white">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/pricing#faq" className="transition-colors hover:text-white">
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Column */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Company</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/about" className="transition-colors hover:text-white">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="transition-colors hover:text-white">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/help" className="transition-colors hover:text-white">
                  Help and Support
                </Link>
              </li>
              <li>
                <Link to="/login" className="transition-colors hover:text-white">
                  Sign In
                </Link>
              </li>
              <li>
                <Link to="/register" className="transition-colors hover:text-white">
                  Get Started Free
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Legal</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/privacy" className="transition-colors hover:text-white">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="transition-colors hover:text-white">
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link to="/help" className="transition-colors hover:text-white">
                  Security &amp; Data Protection
                </Link>
              </li>
            </ul>
          </div>

          {/* Social Column */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Connect</h3>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              Follow product updates, small-business guides, and feature releases.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Festola Business Hub on X"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-[#D90000] hover:bg-[#D90000] hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Festola Business Hub on Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-[#D90000] hover:bg-[#D90000] hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                </svg>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Festola Business Hub on LinkedIn"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-[#D90000] hover:bg-[#D90000] hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                </svg>
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Festola Business Hub on Facebook"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-[#D90000] hover:bg-[#D90000] hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Copyright Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-slate-400 sm:flex-row">
          <p>&copy; {currentYear} Festola Business Hub. All rights reserved.</p>
          <p>Manage. Grow. Succeed.</p>
        </div>
      </div>
    </footer>
  );
}
