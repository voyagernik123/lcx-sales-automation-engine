export function StatusLegend() {
  return (
    <div className="text-xs">
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-status-ready mr-1" /> Ready
      </div>
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-status-conditional mr-1" /> Conditional
      </div>
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-status-blocked mr-1" /> Blocked
      </div>
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-status-deferred mr-1" /> Deferred
      </div>
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-status-unverified mr-1" /> Needs verification
      </div>
    </div>
  );
}
