# ModPit

ModPit helps moderators review reported posts faster by clustering similar reports and applying moderation actions in bulk.

## What It Does

- Cluster reported posts based on what they were reported and severity (`critical`, `high`, `low`)
- Shows a cluster-first moderation dashboard inside a Reddit custom post
- Supports split-level bulk actions so mods can moderate many posts at once
- Supports single-post deep review with author context and post-level actions

## Moderator Workflow

1. Open ModPit from moderator menu actions (`subreddit` and `post` locations).
2. Review active clusters in the dashboard.
3. Open a cluster and moderate by severity split, or open a single post for detail review.
4. Apply selected moderation actions.
5. Moderated posts are removed from active cluster views so the board focuses on unmoderated reported posts.

## Supported Actions

- Approve
- Remove
- Mark Spam
- Lock Comments
- Add User Note
- Send Removal Reason
- Temporary Ban
- Permanent Ban
- Mute User
- Escalate
- Ignore Reports