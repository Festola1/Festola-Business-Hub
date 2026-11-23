import { useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, Mail, MapPin, MessageSquare } from 'lucide-react';
import { PublicFooter } from '../../components/marketing/PublicFooter';
import { PublicNavbar } from '../../components/marketing/PublicNavbar';

interface ContactFormErrors {
  fullName?: string;
  email?: string;
  businessName?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: ContactFormErrors = {};

    if (fullName.trim().length < 2) {
      nextErrors.fullName = 'Please enter your full name.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Please enter a valid email address.';
    }
    if (businessName.trim().length < 2) {
      nextErrors.businessName = 'Please enter your business name.';
    }
    if (message.trim().length < 10) {
      nextErrors.message = 'Please include at least 10 characters so we can assist you properly.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitted(false);
      return;
    }

    setErrors({});
    setSubmitted(true);
    setFullName('');
    setEmail('');
    setBusinessName('');
    setPhone('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-[#F8F8FA] text-[#151B2B]">
      <PublicNavbar />

      <main className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">Contact Us</p>
            <h1 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
              We&apos;re Here to Help Your Business Get Started
            </h1>
            <p className="mt-3 text-base text-[#4B5565]">
              Have questions about POS setup, offline usage, subscription plans, or multi-branch
              onboarding? Send us a message below.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Contact Channels */}
            <div className="space-y-4 lg:col-span-5">
              <div className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-[#151B2B]">Support &amp; Sales Email</h2>
                    <p className="mt-1 text-sm text-[#4B5565]">
                      Reach our team directly for onboarding, billing, or technical inquiries.
                    </p>
                    <a
                      href="mailto:support@festolabusinesshub.com"
                      className="mt-2 inline-block text-sm font-semibold text-[#D90000] hover:underline"
                    >
                      support@festolabusinesshub.com
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-[#151B2B]">Support Hours</h2>
                    <p className="mt-1 text-sm text-[#4B5565]">
                      Monday – Saturday, 8:00 AM – 6:00 PM (WAT)
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-[#151B2B]">Market Coverage</h2>
                    <p className="mt-1 text-sm text-[#4B5565]">
                      Serving Nigerian SMEs nationwide with remote onboarding across Africa.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Inquiry Form */}
            <div className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-2xs sm:p-8 lg:col-span-7">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="h-5 w-5 text-[#D90000]" aria-hidden="true" />
                <h2 className="text-lg font-bold text-[#151B2B]">Send an Inquiry</h2>
              </div>

              {submitted && (
                <div
                  role="status"
                  className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                >
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold">Message received</p>
                    <p className="mt-0.5 text-emerald-800">
                      Thank you for contacting Festola Business Hub. Our team will respond via email
                      during support hours, or you can write directly to{' '}
                      <span className="font-medium">support@festolabusinesshub.com</span>.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contact-name"
                      className="block text-sm font-semibold text-[#151B2B]"
                    >
                      Full Name <span className="text-[#D90000]">*</span>
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      aria-invalid={Boolean(errors.fullName)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-[#D6DBE5] bg-white px-3.5 text-sm text-[#151B2B] focus:border-[#D90000] focus:outline-none"
                    />
                    {errors.fullName && (
                      <p className="mt-1 text-xs font-medium text-[#D90000]">{errors.fullName}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="contact-email"
                      className="block text-sm font-semibold text-[#151B2B]"
                    >
                      Email Address <span className="text-[#D90000]">*</span>
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourbusiness.ng"
                      aria-invalid={Boolean(errors.email)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-[#D6DBE5] bg-white px-3.5 text-sm text-[#151B2B] focus:border-[#D90000] focus:outline-none"
                    />
                    {errors.email && (
                      <p className="mt-1 text-xs font-medium text-[#D90000]">{errors.email}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contact-business"
                      className="block text-sm font-semibold text-[#151B2B]"
                    >
                      Business Name <span className="text-[#D90000]">*</span>
                    </label>
                    <input
                      id="contact-business"
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Your shop or company name"
                      aria-invalid={Boolean(errors.businessName)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-[#D6DBE5] bg-white px-3.5 text-sm text-[#151B2B] focus:border-[#D90000] focus:outline-none"
                    />
                    {errors.businessName && (
                      <p className="mt-1 text-xs font-medium text-[#D90000]">
                        {errors.businessName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="contact-phone"
                      className="block text-sm font-semibold text-[#151B2B]"
                    >
                      Phone Number (Optional)
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+234 800 000 0000"
                      className="mt-1.5 h-11 w-full rounded-xl border border-[#D6DBE5] bg-white px-3.5 text-sm text-[#151B2B] focus:border-[#D90000] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    className="block text-sm font-semibold text-[#151B2B]"
                  >
                    How can we help? <span className="text-[#D90000]">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your business type, number of staff or locations, and what you need..."
                    aria-invalid={Boolean(errors.message)}
                    className="mt-1.5 w-full rounded-xl border border-[#D6DBE5] bg-white p-3.5 text-sm text-[#151B2B] focus:border-[#D90000] focus:outline-none"
                  />
                  {errors.message && (
                    <p className="mt-1 text-xs font-medium text-[#D90000]">{errors.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#D90000] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#B30000] sm:w-auto"
                >
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
