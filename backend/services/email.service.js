/**
 * Email Service for Live Sales
 * Handles 2FA code delivery and other transactional emails
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Konfiguracja transportera przez env vars
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

/**
 * Mask email for logging (show first 3 chars + domain)
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length > 3 ? local.substring(0, 3) + '***' : '***';
  return `${maskedLocal}@${domain}`;
}

/**
 * Send 2FA verification code to user's email
 * @param {string} email - Recipient email address
 * @param {string} code - 6-digit verification code
 * @param {string} purpose - Purpose of the code ('login', 'enable', 'disable')
 * @returns {Promise<boolean>} - True if sent successfully
 */
async function send2FACode(email, code, purpose = 'login') {
  const purposeMessages = {
    login: 'weryfikacji logowania',
    enable: 'włączenia 2FA',
    disable: 'wyłączenia 2FA',
  };

  const purposeText = purposeMessages[purpose] || 'weryfikacji';

  const mailOptions = {
    from: process.env.SMTP_FROM || 'Live Sales <noreply@livesales.app>',
    to: email,
    subject: `Kod ${purposeText} - Live Sales`,
    text: `Twój kod ${purposeText}: ${code}

Kod wygasa za 10 minut.

Jeśli nie prosiłeś o ten kod, zignoruj tę wiadomość.

--
Live Sales
Ta wiadomość została wygenerowana automatycznie.`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 480px; margin: 0 auto; padding: 20px; }
    .code-box { background: #f4f7fa; border: 2px solid #e1e5eb; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a; font-family: monospace; }
    .warning { color: #666; font-size: 14px; margin-top: 16px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Kod ${purposeText}</h2>
    <p>Użyj poniższego kodu, aby potwierdzić swoją tożsamość:</p>
    <div class="code-box">
      <div class="code">${code}</div>
    </div>
    <p class="warning">Kod wygasa za 10 minut. Jeśli nie prosiłeś o ten kod, zignoruj tę wiadomość.</p>
    <div class="footer">
      <p>Live Sales - Automatyczny eksport danych</p>
      <p>Ta wiadomość została wygenerowana automatycznie.</p>
    </div>
  </div>
</body>
</html>`,
  };

  try {
    // Sprawdź czy SMTP jest skonfigurowany
    if (!process.env.SMTP_HOST) {
      logger.warn('SMTP not configured, skipping email send', {
        action: 'send_2fa_code',
        purpose,
        email: maskEmail(email),
      });
      // W development mode zwróć sukces (loguj kod do konsoli)
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`[DEV MODE] 2FA Code for ${maskEmail(email)}: ${code}`);
        return true;
      }
      throw new Error('SMTP nie jest skonfigurowany');
    }

    await transporter.sendMail(mailOptions);

    logger.info('2FA code sent successfully', {
      action: 'send_2fa_code',
      purpose,
      email: maskEmail(email),
    });

    return true;
  } catch (error) {
    logger.error('Failed to send 2FA email', {
      action: 'send_2fa_code',
      purpose,
      email: maskEmail(email),
      error: error.message,
    });
    throw new Error('Nie udało się wysłać kodu email');
  }
}

/**
 * Send password changed notification
 * @param {string} email - Recipient email address
 * @param {string} ipAddress - IP address where change occurred
 * @returns {Promise<boolean>}
 */
async function sendPasswordChangedNotification(email, ipAddress) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'Live Sales <noreply@livesales.app>',
    to: email,
    subject: 'Hasło zostało zmienione - Live Sales',
    text: `Twoje hasło do Live Sales zostało zmienione.

Jeśli to Ty zmieniłeś hasło, możesz zignorować tę wiadomość.

Jeśli nie zmieniałeś hasła, natychmiast skontaktuj się z nami i zresetuj hasło.

Szczegóły:
- Data: ${new Date().toLocaleString('pl-PL')}
- IP: ${ipAddress || 'nieznane'}

--
Live Sales`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 480px; margin: 0 auto; padding: 20px; }
    .alert { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .details { background: #f4f7fa; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Hasło zostało zmienione</h2>
    <p>Twoje hasło do Live Sales zostało zmienione.</p>
    <div class="alert">
      <strong>Nie rozpoznajesz tej aktywności?</strong><br>
      Jeśli nie zmieniałeś hasła, natychmiast skontaktuj się z nami.
    </div>
    <div class="details">
      <strong>Szczegóły:</strong><br>
      Data: ${new Date().toLocaleString('pl-PL')}<br>
      IP: ${ipAddress || 'nieznane'}
    </div>
  </div>
</body>
</html>`,
  };

  try {
    if (!process.env.SMTP_HOST) {
      logger.warn('SMTP not configured, skipping password change notification');
      return true;
    }

    await transporter.sendMail(mailOptions);
    logger.info('Password change notification sent', { email: maskEmail(email) });
    return true;
  } catch (error) {
    logger.error('Failed to send password change notification', {
      email: maskEmail(email),
      error: error.message,
    });
    // Nie rzucamy błędu - powiadomienie nie jest krytyczne
    return false;
  }
}

/**
 * Verify SMTP connection
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
  try {
    if (!process.env.SMTP_HOST) {
      logger.warn('SMTP not configured');
      return false;
    }
    await transporter.verify();
    logger.info('SMTP connection verified');
    return true;
  } catch (error) {
    logger.error('SMTP connection verification failed', { error: error.message });
    return false;
  }
}

module.exports = {
  send2FACode,
  sendPasswordChangedNotification,
  verifyConnection,
  maskEmail,
};
