/** Dark-console status pill. Maps common task/proof statuses to an accent tone. */
export default function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? "—").toLowerCase();

  let color = "var(--vc-muted)";
  if (["verified", "completed", "proven", "confirmed", "online"].includes(s)) {
    color = "var(--vc-m-teal)";
  } else if (["failed", "error", "offline"].includes(s)) {
    color = "#ff9a9a";
  } else if (["pending", "running", "processing", "proof_ready", "decomposing", "discovering"].includes(s)) {
    color = "var(--vc-accent-2)";
  }

  return (
    <span className="vc-chip" style={{ color }}>
      <span className="vc-dot" />
      {status ?? "—"}
    </span>
  );
}
