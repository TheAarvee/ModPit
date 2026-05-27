import type { BulkModAction } from "../../shared/api";

export const MOD_ACTION_OPTIONS: { id: BulkModAction; label: string }[] = [
  { id: "approve", label: "Approve" },
  { id: "remove", label: "Remove" },
  { id: "mark_spam", label: "Mark Spam" },
  { id: "lock_comments", label: "Lock Comments" },
  { id: "add_user_note", label: "Add User Note" },
  { id: "send_removal_reason", label: "Send Removal Reason" },
  { id: "temporary_ban", label: "Temporary Ban" },
  { id: "permanent_ban", label: "Permanent Ban" },
  { id: "mute_user", label: "Mute User" },
  { id: "escalate", label: "Escalate" },
  { id: "ignore_reports", label: "Ignore Reports" },
];
