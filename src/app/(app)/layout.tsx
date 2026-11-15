import { cookies } from "next/headers";
import { Sidebar } from "@/components/app/Sidebar";
import { SIDEBAR_COOKIE } from "@/components/app/sidebar-cookie";
import { getSessionEmail } from "@/lib/auth/session";

/**
 * The internal app shell: sidebar and scrolling main column. The sidebar's collapsed state comes from a cookie, so it
 * renders right the first time. With sign-in on, the sidebar also shows who is signed in and a Sign out button.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, email] = await Promise.all([cookies(), getSessionEmail()]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  return (
    <div className="flex min-h-dvh flex-1 bg-ground text-ink [color-scheme:light]">
      <Sidebar defaultCollapsed={collapsed} userEmail={email} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
