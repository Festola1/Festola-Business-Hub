import { describe, expect, it } from 'vitest';
import {
  extractFieldErrors,
  getFriendlyApiError,
  getFriendlyAuthError,
} from '../../src/lib/error-messages';
import {
  BusinessSettingsSchema,
  LocationSettingsSchema,
  LoginFormSchema,
  OnboardingBusinessSchema,
  RegisterFormSchema,
  ResetPasswordSchema,
  validateWithSchema,
} from '../../src/lib/validation';

describe('Stage 09 Friendly Error Mapper & Client Validation Schemas', () => {
  it('maps every core Stage 07/08 ApiErrorCode to SME-friendly copy and hides raw SQL details', () => {
    expect(
      getFriendlyApiError({ code: 'UNAUTHENTICATED', message: 'JWT expired', details: {} }),
    ).toMatch(/session has expired/i);
    expect(
      getFriendlyApiError({ code: 'EMAIL_NOT_VERIFIED', message: 'Unverified', details: {} }),
    ).toMatch(/verify your email/i);
    expect(
      getFriendlyApiError({ code: 'PERMISSION_DENIED', message: 'Forbidden', details: {} }),
    ).toMatch(/do not have permission/i);
    expect(
      getFriendlyApiError({ code: 'DEVICE_REVOKED', message: 'Revoked', details: {} }),
    ).toMatch(/device has been revoked/i);
    expect(
      getFriendlyApiError({ code: 'SUBSCRIPTION_READ_ONLY', message: 'RO', details: {} }),
    ).toMatch(/read-only mode/i);
    expect(getFriendlyApiError({ code: 'RATE_LIMITED', message: '429', details: {} })).toMatch(
      /Too many requests/i,
    );
    expect(
      getFriendlyApiError({
        code: 'UNKNOWN_SQL_ERR',
        message: 'syntax error at or near SELECT postgres relation users',
        details: {},
      }),
    ).toBe('Unable to complete this request. Please try again.');
  });

  it('maps Supabase Auth errors and extracts VALIDATION_ERROR field details', () => {
    expect(getFriendlyAuthError('Invalid login credentials')).toMatch(
      /Incorrect email address or password/i,
    );
    expect(getFriendlyAuthError('Email not confirmed')).toMatch(/verify your email/i);

    const fields = extractFieldErrors({
      code: 'VALIDATION_ERROR',
      message: 'Invalid payload',
      details: {
        issues: [
          { path: ['name'], message: 'Name is required' },
          { path: ['taxRate'], message: 'Tax rate must be <= 100' },
        ],
      },
    });
    expect(fields).toEqual({
      name: 'Name is required',
      taxRate: 'Tax rate must be <= 100',
    });
  });

  it('enforces Login, Register (including D-08 NDPA consent), and ResetPassword schemas', () => {
    const badLogin = validateWithSchema(LoginFormSchema, { email: 'bad-email', password: '' });
    expect(badLogin.ok).toBe(false);
    if (!badLogin.ok) {
      expect(badLogin.fieldErrors.email).toMatch(/valid email/i);
      expect(badLogin.fieldErrors.password).toMatch(/Enter your password/i);
    }

    const noConsent = validateWithSchema(RegisterFormSchema, {
      fullName: 'Adaeze Okafor',
      email: 'adaeze@festola.ng',
      password: 'StrongPassword123',
      acceptedTerms: false,
    });
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) {
      expect(noConsent.fieldErrors.acceptedTerms).toMatch(/Terms of Service/i);
    }

    const mismatchReset = validateWithSchema(ResetPasswordSchema, {
      password: 'NewPassword123!',
      confirmPassword: 'DifferentPassword123!',
    });
    expect(mismatchReset.ok).toBe(false);
    if (!mismatchReset.ok) {
      expect(mismatchReset.fieldErrors.confirmPassword).toMatch(/do not match/i);
    }
  });

  it('validates Onboarding, BusinessSettings (D-03 tax bounds), and LocationSettings (D-02)', () => {
    const badOnboarding = validateWithSchema(OnboardingBusinessSchema, {
      name: 'A',
      currencyCode: 'NGN',
      timezone: 'Africa/Lagos',
      locationName: 'M',
      phone: '12',
      address: '',
    });
    expect(badOnboarding.ok).toBe(false);

    const badTax = validateWithSchema(BusinessSettingsSchema, {
      name: 'Adaeze Mart',
      phone: '',
      address: '',
      taxId: '',
      taxEnabled: true,
      taxMode: 'exclusive',
      taxRate: '150',
      allowNegativeStock: false,
      receiptFooter: '',
    });
    expect(badTax.ok).toBe(false);
    if (!badTax.ok) {
      expect(badTax.fieldErrors.taxRate).toMatch(/between 0.01 and 100/i);
    }

    const validTaxOff = validateWithSchema(BusinessSettingsSchema, {
      name: 'Adaeze Mart',
      phone: '+2348012345678',
      address: '14 Allen Ave',
      taxId: '',
      taxEnabled: false,
      taxMode: 'exclusive',
      taxRate: '0',
      allowNegativeStock: false,
      receiptFooter: 'Thank you',
    });
    expect(validTaxOff.ok).toBe(true);

    const badLocation = validateWithSchema(LocationSettingsSchema, {
      name: 'X',
      phone: '',
      address: '',
    });
    expect(badLocation.ok).toBe(false);
  });
});
