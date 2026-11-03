import type { Command } from "commander";
import {
  deleteContentCommentsId,
  deleteContentMembersIdBan,
  getContentChannels,
  getContentLivesIdChat,
  getContentMeetups,
  getContentModerationBans,
  getContentModerationMemberPosts,
  getContentModerationQueue,
  patchContentMeetupsIdRsvpsRsvpId,
  postContentLivesIdResetKey,
  postContentMeetupsIdPublish,
  postContentMembersIdBan,
  postContentModerationCommentsIdHide,
  postContentModerationCommentsIdIgnoreReports,
  postContentModerationCommentsIdUnhide,
  postContentModerationMemberPostsIdApprove,
  postContentModerationMemberPostsIdReject,
  postContentModerationMemberPostsIdRemove,
  putContentChannelsOrder,
  putContentMeetupsIdAttendance,
  putContentPostsIdPin,
  putContentSeriesIdPublished,
  putContentVideosIdPublished,
  putContentVideosIdSeries,
} from "../client/sdk.gen";
import { fail } from "../lib/api";
import { bool, list, op, orNull } from "./op";

/**
 * Community management from contracts 1.26-1.36 (channels, posts, videos and
 * series, live streams, meetups, moderation). The CRUD verbs go through
 * registerResource in program.ts; these are the verbs that take a flag-built
 * body, a second id or no id at all.
 */

const page = (v: string | undefined) =>
  v === undefined ? undefined : Number(v);

/** Extras of `ft content-posts`: pin/unpin. */
export function extendContentPosts(root: Command): void {
  for (const [name, pinned] of [
    ["pin", true],
    ["unpin", false],
  ] as const)
    op(root, {
      name: `${name} <postId>`,
      describe: pinned
        ? "Pin a published post (unpins the previous one)"
        : "Unpin a post",
      call: ([id]) => putContentPostsIdPin({ path: { id }, body: { pinned } }),
    });
}

/** Extras of `ft content-videos`: publish/unpublish and series. */
export function extendContentVideos(root: Command): void {
  for (const [name, published] of [
    ["publish", true],
    ["unpublish", false],
  ] as const)
    op(root, {
      name: `${name} <videoId>`,
      describe: published
        ? "Publish a video to the community feed (members are notified once)"
        : "Take a video out of the feed",
      call: ([id]) =>
        putContentVideosIdPublished({ path: { id }, body: { published } }),
    });
  op(root, {
    name: "set-series <videoId>",
    describe: "Move a video into a series, or out of it with --series none",
    required: [["--series <id>", 'series id, or "none"']],
    call: ([id], o) =>
      putContentVideosIdSeries({
        path: { id },
        body: { seriesId: orNull(o.series) },
      }),
  });
}

/** Extras of `ft content-series`: publish/unpublish. */
export function extendContentSeries(root: Command): void {
  for (const [name, published] of [
    ["publish", true],
    ["unpublish", false],
  ] as const)
    op(root, {
      name: `${name} <seriesId>`,
      describe: `${published ? "Publish" : "Unpublish"} a video series`,
      call: ([id]) =>
        putContentSeriesIdPublished({ path: { id }, body: { published } }),
    });
}

/** Extras of `ft content-lives`: chat and reset-key. */
export function extendContentLives(root: Command): void {
  op(root, {
    name: "chat <liveId>",
    describe: "Chat history of a live stream",
    call: ([id]) => getContentLivesIdChat({ path: { id } }),
    pick: (body, o) => (o.json ? body.data : body.data?.messages),
  });
  op(root, {
    name: "reset-key <liveId>",
    describe:
      "Rotate the stream key (the old one stops working and an encoder on air is cut off); prints the new secret key",
    confirm: ([id]) =>
      `Rotate the stream key of live ${id}? An encoder using the current key is cut off.`,
    call: ([id]) => postContentLivesIdResetKey({ path: { id } }),
  });
}

/** Extras of `ft content-channels`: list and order. */
export function extendContentChannels(root: Command): void {
  op(root, {
    name: "list",
    describe: "Active community channels in display order",
    call: () => getContentChannels({}),
    columns: ["id", "kind", "name", "slug", "whoCanPost", "requiresApproval"],
  });
  op(root, {
    name: "order <ids>",
    describe:
      "Reorder the channels: EVERY active channel id, comma-separated, Announcements first",
    call: ([ids]) =>
      putContentChannelsOrder({ body: { orderedIds: list(ids) ?? [] } }),
  });
}

/** Extras of `ft content-meetups`: list, publish, rsvp, attendance. */
export function extendContentMeetups(root: Command): void {
  op(root, {
    name: "list",
    describe: "Community meetups",
    call: () => getContentMeetups({}),
    columns: [
      "id",
      "title",
      "format",
      "status",
      "startsAt",
      "city",
      "goingCount",
      "pendingCount",
    ],
  });
  op(root, {
    name: "publish <meetupId>",
    describe:
      "Publish a draft meetup (queues a notification to the whole community)",
    confirm: ([id]) =>
      `Publish meetup ${id}? The whole community gets notified.`,
    call: ([id]) => postContentMeetupsIdPublish({ path: { id } }),
  });
  op(root, {
    name: "rsvp <meetupId> <rsvpId>",
    describe: "Approve or reject an RSVP request (the member gets an email)",
    options: [
      ["--approve", "approve the request"],
      ["--reject", "reject the request"],
    ],
    check: (_args, o) => {
      if (!o.approve === !o.reject)
        fail("Pass exactly one of --approve or --reject.");
    },
    confirm: ([id, rsvpId], o) =>
      `${o.approve ? "Approve" : "Reject"} RSVP ${rsvpId} of meetup ${id}? The member gets an email.`,
    call: ([id, rsvpId], o) =>
      patchContentMeetupsIdRsvpsRsvpId({
        path: { id, rsvpId },
        body: { decision: o.approve ? "APPROVE" : "REJECT" },
      }),
  });
  op(root, {
    name: "attendance <meetupId> <rsvpId>",
    describe:
      "Mark (or with --attended false, unmark) an attendee as checked in",
    options: [["--attended <bool>", "true | false", "true"]],
    call: ([id, rsvpId], o) =>
      putContentMeetupsIdAttendance({
        path: { id },
        body: { rsvpId, attended: bool(o.attended) },
      }),
  });
}

/** `ft content-moderation …`, `ft content-comments …`, `ft content-members …` */
export function registerModeration(program: Command): void {
  const mod = program
    .command("content-moderation")
    .description("Community moderation: reported comments, member posts, bans");

  op(mod, {
    name: "queue",
    describe: "Reported comments, most reported first (50 per page)",
    options: [["--page <n>", "0-based page"]],
    call: (_a, o) =>
      getContentModerationQueue({ query: { page: page(o.page) } }),
    columns: ["commentId", "openReportCount", "hidden", "deleted", "body"],
  });
  op(mod, {
    name: "bans",
    describe: "Members banned from the community (latest 200)",
    call: () => getContentModerationBans({}),
    columns: ["id", "customerName", "reason", "createdAt"],
  });
  op(mod, {
    name: "member-posts",
    describe: "Member posts awaiting review (or recently published)",
    options: [
      ["--status <s>", "PENDING_REVIEW | PUBLISHED"],
      ["--page <n>", "0-based page"],
    ],
    call: (_a, o) =>
      getContentModerationMemberPosts({
        query: { status: o.status, page: page(o.page) },
      }),
    columns: ["postId", "status", "channelName", "updatedAt", "content"],
  });
  op(mod, {
    name: "approve <postId>",
    describe:
      "Publish a pending member post (author and mentioned members are notified)",
    required: [
      [
        "--expected-updated-at <iso>",
        "the post's updatedAt from `member-posts` (409 if edited since)",
      ],
    ],
    call: ([id], o) =>
      postContentModerationMemberPostsIdApprove({
        path: { id },
        body: { expectedUpdatedAt: o.expectedUpdatedAt },
      }),
  });
  for (const [name, fn, what] of [
    ["reject", postContentModerationMemberPostsIdReject, "Reject a pending"],
    ["remove", postContentModerationMemberPostsIdRemove, "Remove a published"],
  ] as const)
    op(mod, {
      name: `${name} <postId>`,
      describe: `${what} member post (--ban-author also bans its author)`,
      options: [
        ["--reason <text>", "reason shown to the author"],
        ["--ban-author", "also ban the author from the community"],
      ],
      confirm: ([id], o) =>
        `${name === "reject" ? "Reject" : "Remove"} member post ${id}${o.banAuthor ? " and ban its author" : ""}?`,
      call: ([id], o) =>
        fn({
          path: { id },
          body: { reason: o.reason, banAuthor: Boolean(o.banAuthor) },
        }),
    });

  const comments = program
    .command("content-comments")
    .description("Community comments (moderation)");
  for (const [name, fn, describe] of [
    [
      "hide",
      postContentModerationCommentsIdHide,
      "Hide a comment (reversible)",
    ],
    ["unhide", postContentModerationCommentsIdUnhide, "Show a hidden comment"],
    [
      "ignore-reports",
      postContentModerationCommentsIdIgnoreReports,
      "Dismiss the open reports of a comment",
    ],
  ] as const)
    op(comments, {
      name: `${name} <commentId>`,
      describe,
      call: ([id]) => fn({ path: { id } }),
    });
  op(comments, {
    name: "delete <commentId>",
    describe:
      "Delete a comment and its replies (irreversible; `hide` is the reversible one)",
    confirm: ([id]) => `Delete comment ${id} and its replies?`,
    call: ([id]) => deleteContentCommentsId({ path: { id } }),
  });

  const members = program
    .command("content-members")
    .description("Community members (bans)");
  op(members, {
    name: "ban <customerId>",
    describe:
      "Ban a member from posting, commenting and RSVPing (cancels their upcoming RSVPs)",
    required: [["--comment <id>", "comment of theirs the ban comes from"]],
    options: [
      ["--reason <text>", "reason"],
      ["--hide-all-comments", "hide all their comments in this workspace"],
    ],
    confirm: ([id]) =>
      `Ban member ${id} from the community? Their upcoming RSVPs are cancelled.`,
    call: ([id], o) =>
      postContentMembersIdBan({
        path: { id },
        body: {
          commentId: o.comment,
          reason: o.reason,
          hideAllComments: Boolean(o.hideAllComments),
        },
      }),
  });
  op(members, {
    name: "unban <customerId>",
    describe: "Lift a member's community ban",
    call: ([id]) => deleteContentMembersIdBan({ path: { id } }),
  });
}
