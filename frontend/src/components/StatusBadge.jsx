const STATUS_CLASSES = {
  Draft: "badge badge-draft",
  Pending: "badge badge-pending",
  "Pending HR Review": "badge badge-pending",
  "Pending CEO Review": "badge badge-pending",
  "Pending Finance Review": "badge badge-pending",
  "Pending Accountant Review": "badge badge-pending",
  Approved: "badge badge-approved",
  Paid: "badge badge-approved",
  Declined: "badge badge-declined",
  "Changes Requested": "badge badge-changes",
  "Needs HR Attention": "badge badge-declined",
  "Not Started": "badge badge-draft",
};

export default function StatusBadge({ status }) {
  return <span className={STATUS_CLASSES[status] || "badge"}>{status}</span>;
}
