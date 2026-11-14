import { z } from "zod";

export const trackingEventSchema = z.object({
  clientId: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum(["open", "watch", "click"]),
  /** watch: { seconds }. click: { target }. */
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type TrackingEvent = z.infer<typeof trackingEventSchema>;
