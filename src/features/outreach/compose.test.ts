import { describe, expect, it } from "vitest";
import { normalizeAddress } from "./address";
import { gmailComposeUrl } from "./compose";

const parse = (url: string) => {
  const u = new URL(url);
  return { origin: u.origin + u.pathname, params: u.searchParams, raw: u.search };
};

describe("gmailComposeUrl", () => {
  it("opens Gmail's compose window with the address, subject and message filled in", () => {
    const { url, bodyIncluded } = gmailComposeUrl({
      to: "sam@gmail.com",
      subject: "Morgan Hall North: finished footage",
      body: "Hi Sam,\n\nYour page is here:\nhttp://localhost:3000/proposals/client-a?ref=email\n\nThe Tradesmark team",
    });
    const { origin, params } = parse(url);
    expect(bodyIncluded).toBe(true);
    expect(origin).toBe("https://mail.google.com/mail/");
    expect(params.get("view")).toBe("cm");
    expect(params.get("to")).toBe("sam@gmail.com");
    expect(params.get("su")).toBe("Morgan Hall North: finished footage");
    // Line breaks and the link's own ? and & survive the round trip.
    expect(params.get("body")).toBe(
      "Hi Sam,\n\nYour page is here:\nhttp://localhost:3000/proposals/client-a?ref=email\n\nThe Tradesmark team",
    );
  });

  it("spells spaces as %20 and never lets a field break out into another parameter", () => {
    const { url } = gmailComposeUrl({ to: "a@b.co", subject: "Q&A, 100% sure = yes", body: "x&to=evil@x.co#frag" });
    const { params, raw } = parse(url);
    expect(raw).not.toContain("+");
    expect(params.get("su")).toBe("Q&A, 100% sure = yes");
    expect(params.get("body")).toBe("x&to=evil@x.co#frag");
    expect(params.getAll("to")).toEqual(["a@b.co"]);
  });

  it("leaves the address out when none was typed, so the operator fills it in Gmail", () => {
    const { params } = parse(gmailComposeUrl({ to: "", subject: "Hi there", body: "Body text here" }).url);
    expect(params.has("to")).toBe(false);
  });

  it("drops a message too long for a link, and says so, so the caller can copy it instead", () => {
    const long = gmailComposeUrl({ to: "a@b.co", subject: "Hi there", body: "é".repeat(3000) });
    expect(long.bodyIncluded).toBe(false);
    const { params } = parse(long.url);
    expect(params.has("body")).toBe(false);
    expect(params.get("to")).toBe("a@b.co");
    expect(long.url.length).toBeLessThan(7500);
  });
});

describe("normalizeAddress (shared by the dialog and the server)", () => {
  it("accepts one plain address, lowercased and trimmed", () => {
    expect(normalizeAddress("  Sam@Gmail.com ")).toBe("sam@gmail.com");
  });

  it("rejects names, lists, and anything that is not an address", () => {
    for (const bad of ["", "sam", "sam@", "Sam <sam@gmail.com>", "a@b.co, c@d.co", "a@b.co;c@d.co", "a b@c.co", null, undefined]) {
      expect(normalizeAddress(bad)).toBeNull();
    }
  });
});
