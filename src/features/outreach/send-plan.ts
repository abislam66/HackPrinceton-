/*
 * What the Send proposal dialog's main button does, decided in one place so it can be tested without a browser. Pure,
 * so the dialog imports it. The server still decides for real (actions.ts); this only keeps the screen honest about it.
 */

export type SendPlan =
  /** The address is blank: a labelled demo copy through the shared Gmail to the team inbox. */
  | { kind: "demo"; deliverTo: string | null }
  /** An address is typed and this person's own Gmail can send it: from `from` to `to`, as written. */
  | { kind: "direct"; from: string; to: string }
  /** An address is typed but the app can't send as this person: nothing to press, use Open in Gmail. */
  | { kind: "blocked"; reason: string }
  /** Nothing is emailed from here: Gmail isn't set up, it already went out, or the person went to Gmail to send it. */
  | { kind: "record" };

export function planSend({
  gmailConfigured,
  alreadyEmailed,
  gmailOpened,
  address,
  sendFrom,
  deliverTo,
}: {
  gmailConfigured: boolean;
  alreadyEmailed: boolean;
  gmailOpened: boolean;
  /** The typed address when it is valid, else null. */
  address: string | null;
  /** The signed-in person's Gmail when the app can send as them, else null. Decided on the server. */
  sendFrom: string | null;
  deliverTo: string | null;
}): SendPlan {
  if (!gmailConfigured || alreadyEmailed || gmailOpened) return { kind: "record" };
  if (!address) return { kind: "demo", deliverTo };
  if (sendFrom) return { kind: "direct", from: sendFrom, to: address };
  return {
    kind: "blocked",
    reason: "The app can't send as your account (it isn't set up for it, or you aren't signed in). Use Open in Gmail to send it from your own Gmail.",
  };
}
