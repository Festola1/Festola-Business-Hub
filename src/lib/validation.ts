import { z } from 'zod';

export type FieldErrorMap<T extends object> = Partial<Record<keyof T, string>>;

export function validateWithSchema<T extends object>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; fieldErrors: FieldErrorMap<T>; summary: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const fieldErrors: FieldErrorMap<T> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key as keyof T]) {
      fieldErrors[key as keyof T] = issue.message;
    }
  }

  const firstMessage =
    result.error.issues[0]?.message ?? 'Please review the highlighted fields and try again.';
  return { ok: false, fieldErrors, summary: firstMessage };
}

export const LoginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const RegisterFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name (at least 2 characters).')
    .max(120, 'Full name cannot exceed 120 characters.'),
  email: z.string().trim().email('Enter a valid work email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128, 'Password cannot exceed 128 characters.'),
  // D-08 NDPA explicit consent capture
  acceptedTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the Festola Terms of Service and Privacy Policy to continue.',
  }),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter the email address linked to your account.'),
});

export const ResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'New password must be at least 8 characters long.')
      .max(128, 'Password cannot exceed 128 characters.'),
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((vals) => vals.password === vals.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const AcceptInviteSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, 'Paste the complete invitation token sent by your Business Owner.'),
});

export const OnboardingBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter a business name (at least 2 characters).')
    .max(120, 'Business name cannot exceed 120 characters.'),
  currencyCode: z.enum(['NGN', 'GHS', 'KES', 'USD']),
  timezone: z.string().trim().min(3, 'Enter a valid IANA timezone (e.g. Africa/Lagos).').max(64),
  locationName: z
    .string()
    .trim()
    .min(2, 'Enter your primary store location name (at least 2 characters).')
    .max(100, 'Location name cannot exceed 100 characters.'),
  phone: z
    .string()
    .trim()
    .max(32, 'Phone number is too long.')
    .refine((v) => v === '' || v.length >= 6, 'Enter a valid phone number or leave blank.'),
  address: z.string().trim().max(300, 'Address cannot exceed 300 characters.'),
});

export const BusinessSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Business name must be at least 2 characters.')
      .max(120, 'Business name cannot exceed 120 characters.'),
    phone: z
      .string()
      .trim()
      .max(32, 'Phone number is too long.')
      .refine((v) => v === '' || v.length >= 6, 'Enter a valid phone number or leave blank.'),
    address: z.string().trim().max(300, 'Store address cannot exceed 300 characters.'),
    taxId: z.string().trim().max(64, 'Tax ID / TIN cannot exceed 64 characters.'),
    taxEnabled: z.boolean(),
    taxMode: z.enum(['exclusive', 'inclusive']),
    taxRate: z.string().trim(),
    allowNegativeStock: z.boolean(),
    receiptFooter: z.string().trim().max(240, 'Receipt footer cannot exceed 240 characters.'),
  })
  .superRefine((vals, ctx) => {
    if (vals.taxEnabled) {
      const rate = Number(vals.taxRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['taxRate'],
          message: 'Enter a valid tax rate between 0.01 and 100 when tax is enabled.',
        });
      }
    }
  });

export const LocationSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Location name must be at least 2 characters.')
    .max(100, 'Location name cannot exceed 100 characters.'),
  phone: z
    .string()
    .trim()
    .max(32, 'Phone number is too long.')
    .refine((v) => v === '' || v.length >= 6, 'Enter a valid phone number or leave blank.'),
  address: z.string().trim().max(300, 'Location address cannot exceed 300 characters.'),
});
