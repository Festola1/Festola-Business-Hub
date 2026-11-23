import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../src/App';
import { OfflineIndicator } from '../../src/components/pwa/OfflineIndicator';
import { PWAInstallButton } from '../../src/components/pwa/PWAInstallButton';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { getVisibleNavItems } from '../../src/lib/permissions';

describe('P-03 PWA Controls, Auth Route Guards & Role Navigation Visibility', () => {
  it('renders Install App button when beforeinstallprompt fires and invokes prompt()', async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    render(<PWAInstallButton />);

    expect(screen.queryByRole('button', { name: /Install App/i })).not.toBeInTheDocument();

    const installEvent = new window.Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    installEvent.prompt = promptMock;
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    act(() => {
      window.dispatchEvent(installEvent);
    });

    const button = await screen.findByRole('button', { name: /Install App/i });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it('displays OfflineIndicator with explicit status text when browser goes offline', () => {
    render(<OfflineIndicator />);

    act(() => {
      window.dispatchEvent(new window.Event('offline'));
    });

    expect(screen.getByRole('status')).toHaveTextContent(/Offline mode/i);

    act(() => {
      window.dispatchEvent(new window.Event('online'));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated visitors on /app/settings safely to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/app/settings']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/Supabase Auth not connected yet/i)).toBeInTheDocument();
  });

  it('requires NDPA Terms acceptance on /register before submission', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { name: /Create your account/i });
    expect(heading).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Adaeze Okafor' } });
    fireEvent.change(screen.getByLabelText(/Work email/i), {
      target: { value: 'adaeze@shop.ng' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Terms of Service/i);
  });

  it('filters sidebar navigation strictly by D-09 roles (Owner, Manager, Cashier)', () => {
    const ownerPaths = getVisibleNavItems('owner').map((i) => i.path);
    const managerPaths = getVisibleNavItems('manager').map((i) => i.path);
    const cashierPaths = getVisibleNavItems('cashier').map((i) => i.path);

    expect(ownerPaths).toContain('/app/settings');
    expect(ownerPaths).toContain('/app/subscription');
    expect(ownerPaths).toContain('/app/audit-logs');

    expect(managerPaths).toContain('/app/staff');
    expect(managerPaths).toContain('/app/inventory');
    expect(managerPaths).toContain('/app/reports');
    expect(managerPaths).not.toContain('/app/settings');
    expect(managerPaths).not.toContain('/app/subscription');
    expect(managerPaths).not.toContain('/app/audit-logs');

    expect(cashierPaths).toContain('/app/pos');
    expect(cashierPaths).toContain('/app/sales');
    expect(cashierPaths).toContain('/app/devices');
    expect(cashierPaths).not.toContain('/app/inventory');
    expect(cashierPaths).not.toContain('/app/expenses');
    expect(cashierPaths).not.toContain('/app/reports');
    expect(cashierPaths).not.toContain('/app/staff');
    expect(cashierPaths).not.toContain('/app/settings');
    expect(cashierPaths).not.toContain('/app/audit-logs');
  });
});
