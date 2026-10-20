const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Verify your email" message. The link opens the web app's /verify-email page. */
export function verifyEmailMessage(link: string, validForHours: number) {
  const href = escapeHtml(link);
  return {
    subject: 'Verify your email for Pypr',
    text: [
      'Welcome to Pypr!',
      '',
      'Open this link to verify your email and finish creating your account:',
      link,
      '',
      `The link works once and expires in ${String(validForHours)} hours.`,
      "If you didn't sign up for Pypr, you can ignore this email.",
    ].join('\n'),
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td>
        <p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-0.04em">pypr</p>
        <h1 style="margin:0 0 12px;font-size:22px">Verify your email</h1>
        <p style="margin:0 0 24px;line-height:1.6;color:#3f3f46">Welcome to Pypr! Confirm this is your email to finish creating your account.</p>
        <p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Verify email</a></p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a">Or paste this link into your browser:<br><a href="${href}" style="color:#3f3f46;word-break:break-all">${href}</a></p>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#71717a">The link works once and expires in ${String(validForHours)} hours. If you didn't sign up for Pypr, you can ignore this email.</p>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
