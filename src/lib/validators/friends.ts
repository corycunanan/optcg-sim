import { z } from "zod";

export const SendFriendRequestSchema = z.object({
  toUserId: z.string().min(1, "toUserId is required"),
});

export const FriendRequestActionSchema = z.object({
  action: z.enum(["accept", "decline"], {
    error: "action must be 'accept' or 'decline'",
  }),
});

export const SidebarUserSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});

export const FriendsResponseSchema = z.object({
  data: z.array(
    z.object({ friendshipId: z.string(), user: SidebarUserSchema })
  ),
});

export const FriendRequestsResponseSchema = z.object({
  data: z.object({
    incoming: z.array(
      z.object({ id: z.string(), fromUser: SidebarUserSchema.optional() })
    ),
  }),
});

export const UserSearchResponseSchema = z.object({
  data: z.array(SidebarUserSchema),
});
