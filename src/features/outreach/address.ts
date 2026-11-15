import { z } from "zod";

/*
 * One email address, checked the same way on the server (gmail.ts, before any send) and in the send dialog
 * (before the button is enabled). No "server-only" here: the browser imports it.
 */

/** One plain address, no display name, no list. */
const SINGLE_ADDRESS = /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\]+\.[^\s@,;<>"()[\]\\]+$/;
/** The same check the outreach schema applies to `deliveredTo` and `account`. */
const EMAIL = z.email();

/** Lowercased and trimmed when it is one plain address, else null. */
export function normalizeAddress(value: string | undefined | null): string | null {
  const address = (value ?? "").trim().toLowerCase();
  return SINGLE_ADDRESS.test(address) && EMAIL.safeParse(address).success ? address : null;
}
