/** Where the "Book a call" button goes. Set NEXT_PUBLIC_BOOKING_URL to use a scheduling link. */
export function bookingUrl(): string {
  return process.env.NEXT_PUBLIC_BOOKING_URL || "mailto:contact@builtbytradesmark.com?subject=Book%20a%20call";
}
