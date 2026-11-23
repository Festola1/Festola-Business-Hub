import type { ServerEnv } from '../../config/env.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import type { PaystackGatewayPort } from '../commerce/commerce.types.ts';

/**
 * Server-only Paystack REST adapter (D-07).
 * Uses `PAYSTACK_SECRET_KEY` strictly on the server; browser clients never see this key.
 */
export function createPaystackGateway(env: ServerEnv): PaystackGatewayPort | null {
  if (!env.PAYSTACK_SECRET_KEY) {
    return null;
  }

  const secretKey = env.PAYSTACK_SECRET_KEY;

  return {
    async initializeTransaction(input) {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo.toString(),
          currency: input.currencyCode,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
      });

      const json = (await response.json()) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; access_code?: string; reference?: string };
      };

      if (!response.ok || !json.status || !json.data?.authorization_url) {
        throw new ApiError(
          502,
          'PAYMENT_VERIFICATION_FAILED',
          'Unable to initialize Paystack checkout session.',
        );
      }

      return {
        authorizationUrl: json.data.authorization_url,
        accessCode: json.data.access_code ?? '',
        reference: json.data.reference ?? input.reference,
      };
    },

    async verifyTransaction(reference) {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        },
      );

      const json = (await response.json()) as {
        status?: boolean;
        data?: {
          reference?: string;
          status?: string;
          amount?: number;
          currency?: string;
          paid_at?: string | null;
        };
      };

      if (!response.ok || !json.status || !json.data) {
        throw new ApiError(
          422,
          'PAYMENT_VERIFICATION_FAILED',
          'Paystack transaction verification failed.',
        );
      }

      const txStatus =
        json.data.status === 'success'
          ? 'success'
          : json.data.status === 'abandoned'
            ? 'abandoned'
            : 'failed';

      return {
        reference: json.data.reference ?? reference,
        status: txStatus,
        amountKobo: BigInt(Math.round(Number(json.data.amount ?? 0))),
        currencyCode: String(json.data.currency ?? 'NGN').toUpperCase(),
        paidAt: json.data.paid_at ?? null,
      };
    },
  };
}
