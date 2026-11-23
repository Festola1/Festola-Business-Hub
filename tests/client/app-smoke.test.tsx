import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';
import { loadClientEnv } from '../../src/config/env';

describe('Festola Frontend & Public Landing Page Tests', () => {
  it('renders the complete Festola Business Hub public landing page sections without fabricated customer claims', () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    // Section B: Hero headline & supporting tagline
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Festola Business Hub/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Manage\. Grow\. Succeed\./i).length).toBeGreaterThan(0);

    // Ensure no fabricated customer counts appear
    expect(screen.queryByText(/50,000\+/i)).not.toBeInTheDocument();

    // Key sections D, E, F, G, H, I, J, K
    expect(
      screen.getByRole('heading', { name: /Powerful Features to Supercharge Your Business/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Get Started in Three Simple Steps/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Everything You Need in One Dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Designed for Different Types of Businesses/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Simple and Affordable Pricing/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /What Business Owners Want from Their Business Software/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Frequently Asked Questions/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Ready to Grow Your Business\?/i }),
    ).toBeInTheDocument();

    // Testimonials are explicitly labelled as placeholders
    expect(screen.getAllByText(/Testimonial Placeholder/i).length).toBe(3);

    // Demonstration data disclosure is present
    expect(screen.getByText(/Illustrative demonstration data/i)).toBeInTheDocument();
  });

  it('toggles pricing between monthly and annual billing and expands FAQ items', () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    // Monthly prices displayed initially
    expect(screen.getByText('₦3,000')).toBeInTheDocument();
    expect(screen.getByText('₦6,000')).toBeInTheDocument();
    expect(screen.getByText('₦10,000')).toBeInTheDocument();

    // Switch to annual billing
    fireEvent.click(screen.getByRole('button', { name: /Annual Billing/i }));
    expect(screen.getByText('₦30,000')).toBeInTheDocument();
    expect(screen.getByText('₦60,000')).toBeInTheDocument();
    expect(screen.getByText('₦100,000')).toBeInTheDocument();

    // Toggle FAQ item 4 (offline sales)
    const offlineFaqBtn = screen.getByRole('button', {
      name: /Can I record sales without internet access\?/i,
    });
    expect(offlineFaqBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(offlineFaqBtn);
    expect(offlineFaqBtn).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText(/Queued transactions sync automatically once your connection returns/i),
    ).toBeInTheDocument();
  });

  it('opens and closes the interactive Watch Demo preview modal', () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Watch Demo/i }));
    expect(
      screen.getByRole('dialog', { name: /See How Festola Business Hub Works/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close demo preview/i }));
    expect(
      screen.queryByRole('dialog', { name: /See How Festola Business Hub Works/i }),
    ).not.toBeInTheDocument();
  });

  it('renders /contact and validates required fields before submission', async () => {
    window.history.pushState({}, '', '/contact');
    render(<App />);

    const submitButton = await screen.findByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    expect(screen.getByText(/Please enter your full name/i)).toBeInTheDocument();
    expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Chidi Eze' } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'owner@store.ng' },
    });
    fireEvent.change(screen.getByLabelText(/Business Name/i), {
      target: { value: 'Eze Retail Mart' },
    });
    fireEvent.change(screen.getByLabelText(/How can we help/i), {
      target: { value: 'We would like to onboard two retail branches.' },
    });

    fireEvent.click(submitButton);
    expect(screen.getByText(/Message received/i)).toBeInTheDocument();
  });

  it('navigates separately from the navbar to Home, Features, How It Works, Pricing, About Us, and Contact pages', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    const navLink = (label: string) => {
      const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
      const links = Array.from(primaryNav.querySelectorAll('a'));
      const match = links.find((el) => el.textContent?.trim() === label);
      if (!match) throw new Error(`Missing nav link: ${label}`);
      return match;
    };

    fireEvent.click(navLink('Features'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Powerful Features to Supercharge Your Business/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/features');

    fireEvent.click(navLink('How It Works'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Get Started in Three Simple Steps/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/how-it-works');

    fireEvent.click(navLink('Pricing'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Simple and Affordable Pricing/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pricing');

    fireEvent.click(navLink('About Us'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Helping Small and Growing Businesses/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/about');

    fireEvent.click(navLink('Contact'));
    expect(await screen.findByRole('button', { name: /Send Message/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/contact');

    fireEvent.click(navLink('Home'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Festola Business Hub/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('only parses browser-safe VITE_* keys and ignores server-only secrets', () => {
    const parsed = loadClientEnv({
      VITE_APP_ENV: 'staging',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'MUST_NEVER_BE_EXPOSED',
      PAYSTACK_SECRET_KEY: 'sk_live_MUST_NEVER_BE_EXPOSED',
    });

    expect(parsed.VITE_APP_ENV).toBe('staging');
    expect('SUPABASE_SERVICE_ROLE_KEY' in parsed).toBe(false);
    expect('PAYSTACK_SECRET_KEY' in parsed).toBe(false);
  });
});
