/**
 * The cookie that remembers whether the sidebar is collapsed. In its own module because the server layout reads it:
 * a value exported from a "use client" file reaches server code as a client reference, not as the string.
 */
export const SIDEBAR_COOKIE = "tm-sidebar";
