import Link from "next/link";
import { Wordmark } from "./Logo";
import { SiteNav } from "./SiteNav";

/** The bar across the top of the internal app. The client-facing proposal page does not use it. */
export function SiteHeader() {
  return (
    <header className="tm-wrap">
      <div className="flex items-center justify-between py-5">
        <Link href="/" className="-m-3 block p-3" aria-label="Tradesmark, home">
          <Wordmark className="h-3 text-cone" title="" />
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
