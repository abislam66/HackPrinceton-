import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Wordmark } from "@/components/ui/Logo";
import { authRequired, isAllowedUser, safeNext } from "@/lib/auth/policy";
import { getSessionClaims } from "@/lib/auth/session";

const ERRORS: Record<string, string> = {
  "not-allowed": "That account can't use this tool. Sign in with a Google account that has been given access.",
  failed: "Sign-in didn't finish. Try again.",
};

/**
 * Sign in with Google. Outside the app shell, so there is no sidebar. Someone already signed in (and allowed) goes
 * straight on to where they were headed. With sign-in off (AUTH_REQUIRED unset) this page isn't needed and says nothing.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const next = safeNext(typeof query.next === "string" ? query.next : undefined);
  if (!authRequired() || isAllowedUser(await getSessionClaims())) redirect(next);
  const error = typeof query.error === "string" ? (ERRORS[query.error] ?? null) : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-ground px-4 text-ink [color-scheme:light]">
      <div className="flex w-full max-w-sm flex-col gap-6 border border-rule/40 bg-sheet p-8">
        <Wordmark className="h-3.5 w-auto self-start text-cone" />
        <div className="flex flex-col gap-2">
          <Heading as="h1" size="xs">
            Sign in
          </Heading>
          <p className="tm-text--s text-muted">
            Use your Google account to open the proposal tool. Clients don&apos;t sign in: they open the link in their email.
          </p>
        </div>
        {error ? (
          <p role="alert" className="tm-text--s border border-rule/40 p-3 text-status-fail-ink">
            {error}
          </p>
        ) : null}
        {/* A plain GET form: a full navigation to the sign-in route, with nothing for the router to prefetch. */}
        <form action="/auth/signin" method="get" className="flex">
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="primary" className="w-full">
            Continue with Google
          </Button>
        </form>
      </div>
    </main>
  );
}
