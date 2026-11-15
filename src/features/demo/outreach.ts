/*
 * Sample outreach rows and replies. Companies and projects are invented (see ./projects.ts); none is a
 * real company. Shown without a "Sample" label, so they read as part of the demo.
 */

export type SampleSent = {
  id: string;
  stakeholder: string;
  project: string;
  sent: string;
  opens: number;
  watchSeconds: number;
  lastActivity: string;
  opened: boolean;
};

export const SAMPLE_SENT: SampleSent[] = [
  {
    id: "brightwater-masonry",
    stakeholder: "Brightwater Masonry",
    project: "Alder Row Townhomes",
    sent: "Nov 9",
    opens: 2,
    watchSeconds: 74,
    lastActivity: "Watched the fly-up · 3 days ago",
    opened: true,
  },
  {
    id: "halvard-development",
    stakeholder: "Halvard Development Group",
    project: "Marrowby House",
    sent: "Nov 12",
    opens: 0,
    watchSeconds: 0,
    lastActivity: "Sent · not opened yet",
    opened: false,
  },
];

export type SampleReply = {
  id: string;
  stakeholder: string;
  project: string;
  received: string;
  excerpt: string;
};

export const SAMPLE_REPLIES: SampleReply[] = [
  {
    id: "brightwater-masonry",
    stakeholder: "Brightwater Masonry",
    project: "Alder Row Townhomes",
    received: "Nov 13",
    excerpt:
      "The fly-up is great. Could the reel spend more time on the brick corners? Happy to talk Thursday afternoon.",
  },
  {
    id: "copperline-roofing",
    stakeholder: "Copperline Roofing",
    project: "Kestrel Yard Lofts",
    received: "Nov 11",
    excerpt: "Thanks for sending this. We're not bidding new work this season; check back with us in March.",
  },
];
