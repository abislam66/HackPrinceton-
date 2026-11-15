/*
 * "Open in Gmail": a link to Gmail's compose window with the recipient, subject and message filled in, so the
 * operator sends it from their own Gmail. Nothing goes through our Gmail credentials. Pure, so the browser uses it.
 */

/**
 * Gmail's compose window takes the whole message in the URL. Much past this, browsers or Gmail start to refuse it,
 * so a message that doesn't fit is left out of the link and the caller puts it on the clipboard instead.
 */
const MAX_URL_LENGTH = 7500;

export type GmailCompose = { url: string; bodyIncluded: boolean };

export function gmailComposeUrl({ to, subject, body }: { to: string; subject: string; body: string }): GmailCompose {
  const link = (withBody: boolean) => {
    const params = new URLSearchParams({ view: "cm", fs: "1", su: subject });
    if (to) params.set("to", to);
    if (withBody) params.set("body", body);
    // URLSearchParams writes a space as "+"; %20 is the spelling every mail client reads as a space.
    return `https://mail.google.com/mail/?${params.toString().replace(/\+/g, "%20")}`;
  };
  const full = link(true);
  return full.length <= MAX_URL_LENGTH ? { url: full, bodyIncluded: true } : { url: link(false), bodyIncluded: false };
}
