export interface StaffInvitationEmailParams {
  gmailAccessToken: string;
  toEmail: string;
  businessName: string;
  role: 'manager' | 'cashier';
  inviterName?: string | null;
  acceptUrl: string;
  expiresAt: string;
}

export interface SendGmailResult {
  ok: boolean;
  messageId?: string;
  authExpired?: boolean;
  error?: string;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

export function encodeBase64UrlUtf8(input: string): string {
  const bytes = new globalThis.TextEncoder().encode(input);
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeRfc2047Subject(subject: string): string {
  const clean = sanitizeHeaderValue(subject);
  if (/^[\x20-\x7E]*$/.test(clean)) {
    return clean;
  }
  const bytes = new globalThis.TextEncoder().encode(clean);
  return `=?UTF-8?B?${encodeBase64(bytes)}?=`;
}

export function buildInvitationAcceptUrl(inviteToken: string, origin?: string): string {
  const resolvedOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://festola.app');
  return `${resolvedOrigin.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(
    inviteToken,
  )}`;
}

export function buildStaffInvitationMimeMessage(
  params: Omit<StaffInvitationEmailParams, 'gmailAccessToken'>,
): string {
  const to = sanitizeHeaderValue(params.toEmail);
  const businessName = sanitizeHeaderValue(params.businessName || 'Festola Business Hub');
  const roleLabel = params.role === 'manager' ? 'Manager' : 'Cashier';
  const inviterLabel = sanitizeHeaderValue(params.inviterName?.trim() || 'A business owner');
  const acceptUrl = sanitizeHeaderValue(params.acceptUrl);
  const expiresFormatted = new Date(params.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `You're invited to join ${businessName} on Festola Business Hub`;
  const boundary = 'festola_invite_alt_boundary_v1';

  const plainText = [
    `Hello,`,
    ``,
    `${inviterLabel} has invited you to join ${businessName} on Festola Business Hub as a ${roleLabel}.`,
    ``,
    `Open the link below to accept your invitation automatically:`,
    `${acceptUrl}`,
    ``,
    `Important: Sign in using this email address (${to}) so your workspace access is activated right away.`,
    `This one-time invitation expires on ${expiresFormatted}.`,
    ``,
    `If you were not expecting this invitation, you can safely ignore this email.`,
  ].join('\r\n');

  const htmlBody = [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<body style="margin:0;padding:0;background-color:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181B;">`,
    `  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">`,
    `    <tr>`,
    `      <td align="center">`,
    `        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">`,
    `          <tr>`,
    `            <td style="background:#991B1B;padding:24px 28px;color:#FFFFFF;">`,
    `              <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">Festola Business Hub</p>`,
    `              <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;font-weight:700;">Staff Workspace Invitation</h1>`,
    `            </td>`,
    `          </tr>`,
    `          <tr>`,
    `            <td style="padding:28px;">`,
    `              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hello,</p>`,
    `              <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">`,
    `                <strong>${escapeHtml(inviterLabel)}</strong> has invited you to join <strong>${escapeHtml(businessName)}</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.`,
    `              </p>`,
    `              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525B;">`,
    `                Click the button below to accept your invitation automatically and open your business workspace.`,
    `              </p>`,
    `              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">`,
    `                <tr>`,
    `                  <td style="border-radius:8px;background:#991B1B;">`,
    `                    <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:12px 22px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">Accept Invitation</a>`,
    `                  </td>`,
    `                </tr>`,
    `              </table>`,
    `              <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#52525B;">`,
    `                Sign in with <strong>${escapeHtml(to)}</strong> if prompted, and your membership will activate automatically.`,
    `              </p>`,
    `              <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#71717A;word-break:break-all;">`,
    `                Direct link: <a href="${escapeHtml(acceptUrl)}" style="color:#991B1B;">${escapeHtml(acceptUrl)}</a>`,
    `              </p>`,
    `              <p style="margin:0;padding-top:16px;border-top:1px solid #E4E4E7;font-size:12px;color:#71717A;">`,
    `                This one-time invitation expires on ${escapeHtml(expiresFormatted)}.`,
    `              </p>`,
    `            </td>`,
    `          </tr>`,
    `        </table>`,
    `      </td>`,
    `    </tr>`,
    `  </table>`,
    `</body>`,
    `</html>`,
  ].join('\r\n');

  return [
    `To: ${to}`,
    `Subject: ${encodeRfc2047Subject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    plainText,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
  ].join('\r\n');
}

export async function sendStaffInvitationEmail(
  params: StaffInvitationEmailParams,
): Promise<SendGmailResult> {
  const mime = buildStaffInvitationMimeMessage({
    toEmail: params.toEmail,
    businessName: params.businessName,
    role: params.role,
    inviterName: params.inviterName,
    acceptUrl: params.acceptUrl,
    expiresAt: params.expiresAt,
  });

  const raw = encodeBase64UrlUtf8(mime);

  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.gmailAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        authExpired: true,
        error: 'Gmail sending permission expired or was not granted. Please reconnect Gmail.',
      };
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return {
        ok: false,
        error: payload?.error?.message ?? 'Gmail could not send the invitation email.',
      };
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return {
      ok: true,
      messageId: payload.id,
    };
  } catch {
    return {
      ok: false,
      error: 'Network error while contacting Gmail. Check your connection and try again.',
    };
  }
}
