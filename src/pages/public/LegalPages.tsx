import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, FileCheck2, HelpCircle, Lock, Mail } from 'lucide-react';
import { PublicFooter } from '../../components/marketing/PublicFooter';
import { PublicNavbar } from '../../components/marketing/PublicNavbar';

function LegalShell({
  eyebrow,
  title,
  subtitle,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8F8FA] text-[#151B2B]">
      <PublicNavbar />
      <main className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#EAECF0] bg-white p-8 shadow-2xs sm:p-10">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                {icon}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                  {eyebrow}
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-[#151B2B] sm:text-3xl">
                  {title}
                </h1>
              </div>
            </div>
            <p className="mt-4 border-b border-[#EAECF0] pb-6 text-sm leading-relaxed text-[#4B5565]">
              {subtitle}
            </p>
            <div className="mt-6 space-y-6 text-sm leading-relaxed text-[#334155]">{children}</div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal & Data Protection"
      title="Privacy Policy"
      subtitle="Festola Business Hub protects your business, staff, and customer data in alignment with the Nigeria Data Protection Act (NDPA) and modern cloud security principles."
      icon={<Lock className="h-5 w-5" aria-hidden="true" />}
    >
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">1. Data We Collect</h2>
        <p className="mt-2">
          We collect only the information required to operate your Festola Business Hub workspace:
          account credentials, business profile details, products, inventory movements, sales
          records, expenses, customer credit balances you enter, and security audit logs.
        </p>
      </section>
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">2. Strict Tenant Isolation</h2>
        <p className="mt-2">
          Each business workspace is logically isolated at both the server and database layers. Your
          sales, profit reports, and customer lists are never shared with or visible to other
          businesses using the platform.
        </p>
      </section>
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">3. Offline Device Storage</h2>
        <p className="mt-2">
          When you enable offline POS recording on your phone or computer, pending transactions are
          stored locally on that device until internet connectivity resumes and synced over
          encrypted HTTPS connections.
        </p>
      </section>
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">4. Your Rights &amp; Contact</h2>
        <p className="mt-2">
          You may request access to, correction of, or export of your business data at any time by
          contacting{' '}
          <a
            href="mailto:support@festolabusinesshub.com"
            className="font-semibold text-[#D90000] hover:underline"
          >
            support@festolabusinesshub.com
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms and Conditions"
      subtitle="These terms govern your use of the Festola Business Hub Progressive Web Application, POS features, and subscription services."
      icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
    >
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">1. Account Responsibility</h2>
        <p className="mt-2">
          Business owners are responsible for maintaining accurate account details, assigning
          appropriate staff roles, and revoking access when a staff member leaves the business or a
          device is lost.
        </p>
      </section>
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">2. Subscriptions &amp; Plan Changes</h2>
        <p className="mt-2">
          Festola Business Hub offers transparent monthly and annual subscription plans (Starter,
          Business, and Premium). You may upgrade or downgrade your subscription from your workspace
          billing settings in line with active plan terms.
        </p>
      </section>
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">3. Ownership of Business Records</h2>
        <p className="mt-2">
          You retain full ownership of all product catalogs, receipts, financial records, and
          customer lists entered into your Festola Business Hub workspace.
        </p>
      </section>
      <section>
        <h2 className="text-base font-bold text-[#151B2B]">4. Acceptable Use</h2>
        <p className="mt-2">
          You agree to use Festola Business Hub solely for lawful commercial operations and not to
          attempt unauthorised access to other business workspaces or platform infrastructure.
        </p>
      </section>
    </LegalShell>
  );
}

export function HelpSupportPage() {
  return (
    <LegalShell
      eyebrow="Help & Support"
      title="Help and Support Centre"
      subtitle="Guides and support options for setting up your store, installing Festola Business Hub on your phone, and managing daily operations."
      icon={<HelpCircle className="h-5 w-5" aria-hidden="true" />}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#EAECF0] bg-[#F8F8FA] p-5">
          <BookOpen className="h-5 w-5 text-[#D90000]" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-[#151B2B]">Getting Started Checklist</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-[#4B5565]">
            <li>Create your owner account and verify your email address.</li>
            <li>Set up your business name, primary location, and Naira currency.</li>
            <li>Add your top products with cost price, selling price, and opening stock.</li>
            <li>Record your first sale in POS and test offline sync.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-[#EAECF0] bg-[#F8F8FA] p-5">
          <Mail className="h-5 w-5 text-[#D90000]" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-[#151B2B]">Need Direct Assistance?</h2>
          <p className="mt-2 text-sm text-[#4B5565]">
            Reach our support team Monday through Saturday (8:00 AM – 6:00 PM WAT) for onboarding
            guidance, staff permissions help, or billing questions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#D90000] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#B30000]"
            >
              Open Contact Form
            </Link>
            <Link
              to="/#faq"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D6DBE5] bg-white px-4 text-xs font-semibold text-[#151B2B] transition-colors hover:bg-[#F8F8FA]"
            >
              Read FAQs
            </Link>
          </div>
        </div>
      </div>
    </LegalShell>
  );
}
