import type { DeviceStatus } from "@/lib/interview/types";

type ReadinessStatusProps = {
  icon: string;
  status: DeviceStatus;
};

export function ReadinessStatus({ icon, status }: ReadinessStatusProps) {
  return (
    <div className="status-row">
      <span aria-hidden>{icon}</span>
      <div>
        <strong>{status.label}</strong>
        <div className="status-copy">{status.message}</div>
      </div>
      <span className={`status-chip ${status.state}`}>{status.state}</span>
    </div>
  );
}
