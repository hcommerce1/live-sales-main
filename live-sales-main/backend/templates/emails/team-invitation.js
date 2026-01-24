/**
 * Team Invitation Email Template
 *
 * Used when a team member invites someone to join their company.
 * Supports both HTML and plain text versions.
 */

/**
 * Generate invitation email content
 *
 * @param {Object} params
 * @param {string} params.inviterName - Name of person who sent invitation
 * @param {string} params.inviterEmail - Email of inviter
 * @param {string} params.companyName - Company name
 * @param {string} params.role - Role being assigned (admin, member)
 * @param {string} params.invitationLink - Full URL to accept invitation
 * @param {string} params.expiresAt - Expiration date string
 * @returns {{subject: string, html: string, text: string}}
 */
function generateInvitationEmail(params) {
  const {
    inviterName,
    inviterEmail,
    companyName,
    role,
    invitationLink,
    expiresAt,
  } = params;

  const roleDisplay = role === 'admin' ? 'Administrator' : 'Member';
  const expiresDate = new Date(expiresAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = `Zaproszenie do ${companyName} - Live Sales`;

  const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zaproszenie do zespołu</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Live Sales
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 20px; font-weight: 600;">
                Zaproszenie do zespołu
              </h2>

              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                <strong>${inviterName || inviterEmail}</strong> zaprosił Cię do dołączenia do zespołu
                <strong>${companyName}</strong> w aplikacji Live Sales.
              </p>

              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; margin: 0 0 30px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="color: #6b7280; font-size: 14px; padding-bottom: 8px;">Firma:</td>
                        <td style="color: #1f2937; font-size: 14px; font-weight: 500; padding-bottom: 8px; text-align: right;">${companyName}</td>
                      </tr>
                      <tr>
                        <td style="color: #6b7280; font-size: 14px; padding-bottom: 8px;">Twoja rola:</td>
                        <td style="color: #1f2937; font-size: 14px; font-weight: 500; padding-bottom: 8px; text-align: right;">${roleDisplay}</td>
                      </tr>
                      <tr>
                        <td style="color: #6b7280; font-size: 14px;">Zaproszenie ważne do:</td>
                        <td style="color: #1f2937; font-size: 14px; font-weight: 500; text-align: right;">${expiresDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${invitationLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 500;">
                      Akceptuj zaproszenie
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Jeśli przycisk nie działa, skopiuj i wklej poniższy link do przeglądarki:
              </p>
              <p style="margin: 8px 0 0 0; color: #2563eb; font-size: 14px; word-break: break-all;">
                ${invitationLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
                Ten email został wysłany z aplikacji Live Sales. Jeśli nie oczekiwałeś tego zaproszenia,
                możesz je zignorować - zaproszenie wygaśnie automatycznie.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
Zaproszenie do zespołu - Live Sales

${inviterName || inviterEmail} zaprosił Cię do dołączenia do zespołu ${companyName} w aplikacji Live Sales.

Szczegóły zaproszenia:
- Firma: ${companyName}
- Twoja rola: ${roleDisplay}
- Zaproszenie ważne do: ${expiresDate}

Aby zaakceptować zaproszenie, kliknij poniższy link:
${invitationLink}

---
Ten email został wysłany z aplikacji Live Sales.
Jeśli nie oczekiwałeś tego zaproszenia, możesz je zignorować - zaproszenie wygaśnie automatycznie.
`;

  return {
    subject,
    html,
    text: text.trim(),
  };
}

/**
 * Generate invitation reminder email
 *
 * @param {Object} params - Same as generateInvitationEmail
 * @returns {{subject: string, html: string, text: string}}
 */
function generateInvitationReminderEmail(params) {
  const {
    inviterName,
    inviterEmail,
    companyName,
    role,
    invitationLink,
    expiresAt,
  } = params;

  const roleDisplay = role === 'admin' ? 'Administrator' : 'Member';
  const expiresDate = new Date(expiresAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = `Przypomnienie: Zaproszenie do ${companyName} - Live Sales`;

  const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Przypomnienie o zaproszeniu</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #f59e0b; padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Live Sales - Przypomnienie
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 20px; font-weight: 600;">
                Twoje zaproszenie wkrótce wygaśnie
              </h2>

              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Przypominamy, że <strong>${inviterName || inviterEmail}</strong> zaprosił Cię do dołączenia
                do zespołu <strong>${companyName}</strong>. Zaproszenie wygaśnie <strong>${expiresDate}</strong>.
              </p>

              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #fef3c7; border-radius: 8px; margin: 0 0 30px 0; border: 1px solid #f59e0b;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                      <strong>Twoja rola:</strong> ${roleDisplay}<br>
                      <strong>Ważne do:</strong> ${expiresDate}
                    </p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${invitationLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 500;">
                      Akceptuj zaproszenie
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Link: ${invitationLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
                Ten email został wysłany z aplikacji Live Sales.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
Przypomnienie: Zaproszenie do zespołu - Live Sales

Twoje zaproszenie wkrótce wygaśnie!

${inviterName || inviterEmail} zaprosił Cię do dołączenia do zespołu ${companyName}.
Zaproszenie wygaśnie ${expiresDate}.

- Twoja rola: ${roleDisplay}

Aby zaakceptować zaproszenie, kliknij poniższy link:
${invitationLink}

---
Ten email został wysłany z aplikacji Live Sales.
`;

  return {
    subject,
    html,
    text: text.trim(),
  };
}

module.exports = {
  generateInvitationEmail,
  generateInvitationReminderEmail,
};
