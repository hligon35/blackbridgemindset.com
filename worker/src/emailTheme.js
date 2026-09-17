function safeText(v) {
  return String(v || '').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Shared HTML wrapper for all outbound emails.
 *
 * Email-client friendly:
 * - table-based layout
 * - inline styles
 * - avoids relying on CSS support beyond basics
 */
export function wrapBbmEmailHtml({
  title,
  preheader,
  contentHtml,
  footerHtml,
}) {
  const t = safeText(title);
  const ph = safeText(preheader);
  const body = String(contentHtml || '');
  const footer = String(footerHtml || '');

  // Theme tokens mirror the Black Bridge Mindset site: charcoal, slate, gold, and silver.
  const bg = '#07090b';
  const panel = '#121a22';
  const border = '#35414d';
  const text = '#f5f7fa';
  const muted = '#bfc7cf';
  const accent = '#f7c873';
  const logoUrl = 'https://blackbridgemindset.com/images/bbmlogo.png';

  // A common Outlook trick: include a lot of whitespace after the preheader.
  const preheaderPadding = '&nbsp;'.repeat(200);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(t)}</title>
  </head>
  <body style="margin:0; padding:0; background:${bg}; color:${text};">
    ${
      ph
        ? `<div style="display:none; font-size:1px; color:${bg}; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${escapeHtml(ph)}${preheaderPadding}</div>`
        : ''
    }
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${bg}; width:100%;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:620px; max-width:620px;">
            <tr>
              <td style="padding:0 0 18px 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="padding:0 11px 0 0;">
                      <img src="${logoUrl}" width="42" height="42" alt="Black Bridge Mindset" style="display:block; width:42px; height:42px; border-radius:999px; border:1px solid rgba(247,200,115,0.65);" />
                    </td>
                    <td valign="middle">
                      <div style="font-size:12px; letter-spacing:3px; text-transform:uppercase; color:${accent}; font-weight:800;">Black Bridge Mindset</div>
                      <div style="margin-top:4px; color:${muted}; font-size:12px;">The conversations that carry us forward.</div>
                    </td>
                  </tr>
                </table>
                ${t ? `<div style="margin-top:22px; font-family:Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.18; font-weight:700; color:${text};">${escapeHtml(t)}</div>` : ''}
                <div style="margin-top:16px; height:2px; background:${accent}; width:100%;"></div>
              </td>
            </tr>
            <tr>
              <td style="background:${panel}; border:1px solid ${border}; border-radius:14px; padding:26px 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.65; color:${text};">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 2px 0 2px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:${muted}; font-size:12px; line-height:1.5;">
                ${(() => {
                  const brand = `
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td valign="middle" style="padding:0 10px 0 0;">
                          <img src="${logoUrl}" width="22" height="22" alt="Black Bridge Mindset" style="display:block; width:22px; height:22px; border-radius:999px; border:1px solid rgba(247,200,115,0.45);" />
                        </td>
                        <td valign="middle" style="padding:0; font-weight:800; color:${accent}; letter-spacing:0.3px;">
                          Black Bridge Mindset
                        </td>
                      </tr>
                    </table>
                  `;

                  if (footer) {
                    return `${brand}<div style="margin-top:8px;">${footer}</div>`;
                  }

                  return `${brand}<div style="margin-top:6px;">If this email isn’t relevant to you, you can ignore it.</div>`;
                })()}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function bbmLinkStyle() {
  return 'color:#f7c873; text-decoration:underline;';
}

export function bbmMutedTextStyle() {
  return 'color:#bdbdbd;';
}

export function renderBbmCodeBoxHtml(codeEscaped) {
  const code = String(codeEscaped || '');
  return `
    <div style="font-size:26px; font-weight:800; letter-spacing:6px; padding:14px 16px; background:#232323; border:1px solid #2a2a2a; border-radius:12px; display:inline-block; color:#ffffff;">
      ${code}
    </div>
  `;
}

export function renderBbmMessageBoxHtml(innerHtml) {
  const content = String(innerHtml || '');
  return `
    <div style="padding:15px 16px; background:#1c2731; border:1px solid #465360; border-left:3px solid #f7c873; border-radius:12px;">
      ${content}
    </div>
  `;
}

export function renderBbmButtonHtml({ hrefEscaped, labelEscaped, secondary = false }) {
  const href = String(hrefEscaped || '').trim();
  const label = String(labelEscaped || '').trim();
  if (!href || !label) return '';

  // Choose colors based on button style
  const bgColor = secondary ? '#1c2731' : '#f7c873';
  const textColor = secondary ? '#f7c873' : '#171b20';
  const borderStyle = secondary ? 'border:1px solid #f7c873;' : 'border:1px solid #f7c873;';

  // Button built from a table for better email client compatibility.
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
      <tr>
        <td bgcolor="${bgColor}" style="border-radius:10px; ${borderStyle}">
          <a href="${href}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; padding:12px 18px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; font-size:14px; font-weight:800; letter-spacing:0.1px; color:${textColor}; text-decoration:none; border-radius:10px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}
