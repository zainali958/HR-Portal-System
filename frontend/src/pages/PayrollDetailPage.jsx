import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPayrollCycle, financeDecidePayroll, accountantDecidePayroll, ceoDecidePayroll,
  escalatePayroll, resolvePayrollEscalation, escalatePayrollToCEO,
} from "../api/payroll";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function PayrollDetailPage() {
  const { id } = useParams();
  const { isHR, isCEO, isAccountant, isFinance } = useAuth();

  const [cycle, setCycle] = useState(null);
  const [status, setStatus] = useState({ state: "loading", message: "" });
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  function load() {
    setStatus({ state: "loading", message: "" });
    getPayrollCycle(id)
      .then((data) => {
        setCycle(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        setStatus({ state: "error", message: err.response?.data?.message || "Failed to load payroll cycle" });
      });
  }

  useEffect(() => { load(); }, [id]);

  async function runAction(fn, ...args) {
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await fn(id, ...args);
      setCycle(updated);
      setReason("");
    } catch (err) {
      setActionError(err.response?.data?.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (status.state === "loading") return <div className="page-content"><p className="muted">Loading...</p></div>;
  if (status.state === "error") return <div className="page-content"><p className="msg error">{status.message}</p></div>;
  if (!cycle) return null;

  const total = cycle.entries.reduce((sum, e) => sum + (e.proposedAmount || 0), 0);

  const canFinanceDecide = isFinance && cycle.status === "Pending Finance Review";
  const canAccountantDecide = isAccountant && cycle.status === "Pending Accountant Review";
  const canCEODecide = isCEO && cycle.status === "Pending CEO Review";
  const canEscalate = (isFinance || isAccountant) &&
    ["Pending Finance Review", "Pending Accountant Review"].includes(cycle.status);
  const canResolveEscalation = isHR && cycle.status === "Needs HR Attention";
  const canEscalateToCEO = isHR && cycle.status === "Needs HR Attention" && !cycle.escalatedToCEO;

  return (
    <div className="page-content">
      <p className="eyebrow">Payroll Cycle</p>
      <div className="page-header">
        <h1>{cycle.company ? cycle.company.name : "-"} — {cycle.month}</h1>
        <StatusBadge status={cycle.status} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Entries</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Designation</th>
                <th>Proposed Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {cycle.entries.map((e, i) => (
                <tr key={i}>
                  <td>{e.employee ? e.employee.employeeName : "-"}</td>
                  <td>{e.employee ? e.employee.designation : "-"}</td>
                  <td>{e.proposedAmount.toLocaleString()}</td>
                  <td>{e.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ textAlign: "right", marginTop: "0.8rem" }}>
          <strong>Total: {total.toLocaleString()}</strong>
        </p>

        <dl className="review-list">
          <dt>Created By</dt><dd>{cycle.createdBy ? cycle.createdBy.fullName : "-"}</dd>
          {cycle.financeDecision?.by && (
            <><dt>Finance Decision</dt><dd>{cycle.financeDecision.by.fullName} — {new Date(cycle.financeDecision.at).toLocaleString()}{cycle.financeDecision.reason ? ` (${cycle.financeDecision.reason})` : ""}</dd></>
          )}
          {cycle.accountantDecision?.by && (
            <><dt>Accountant Decision</dt><dd>{cycle.accountantDecision.by.fullName} — {new Date(cycle.accountantDecision.at).toLocaleString()}{cycle.accountantDecision.reason ? ` (${cycle.accountantDecision.reason})` : ""}</dd></>
          )}
          {cycle.ceoDecision?.by && (
            <><dt>CEO Decision</dt><dd>{cycle.ceoDecision.by.fullName} — {new Date(cycle.ceoDecision.at).toLocaleString()}{cycle.ceoDecision.reason ? ` (${cycle.ceoDecision.reason})` : ""}</dd></>
          )}
          {cycle.escalatedToHR && (
            <><dt>Escalated to HR</dt><dd>{cycle.escalationReason} — {new Date(cycle.escalatedAt).toLocaleString()}</dd></>
          )}
          {cycle.escalatedToCEO && (
            <><dt>Escalated to CEO</dt><dd>{new Date(cycle.escalatedToCEOAt).toLocaleString()}</dd></>
          )}
        </dl>

        {actionError && <p className="msg error">{actionError}</p>}

        {canFinanceDecide && (
          <div className="decision-box">
            <h3>Finance Review</h3>
            <label>
              Reason <span className="optional">(required if declining)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(financeDecidePayroll, "Approved", reason)}>Approve → Send to Accountant</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => runAction(financeDecidePayroll, "Declined", reason)}>Decline</button>
            </div>
          </div>
        )}

        {canAccountantDecide && (
          <div className="decision-box">
            <h3>Accountant Review</h3>
            <label>
              Reason <span className="optional">(required if declining)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(accountantDecidePayroll, "Approved", reason)}>Approve → Send to CEO</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => runAction(accountantDecidePayroll, "Declined", reason)}>Decline</button>
            </div>
          </div>
        )}

        {canCEODecide && (
          <div className="decision-box">
            <h3>CEO Final Sign-Off</h3>
            <label>
              Reason <span className="optional">(required if declining)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <div className="wizard-actions">
              <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(ceoDecidePayroll, "Approved", reason)}>Approve Payroll</button>
              <button className="btn-danger" disabled={actionLoading} onClick={() => runAction(ceoDecidePayroll, "Declined", reason)}>Decline</button>
            </div>
          </div>
        )}

        {canEscalate && (
          <div className="decision-box">
            <h3>Escalate to HR</h3>
            <p className="muted">If there's a problem with this cycle, flag it to HR instead of approving or declining.</p>
            <label>
              Reason
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
            <button className="btn-secondary" disabled={actionLoading || !reason.trim()} onClick={() => runAction(escalatePayroll, reason)}>
              Escalate to HR
            </button>
          </div>
        )}

        {cycle.status === "Needs HR Attention" && (
          <div className="decision-box">
            <h3>Needs HR Attention</h3>
            <p className="muted">{cycle.escalationReason}</p>
            {canResolveEscalation && (
              <div className="wizard-actions">
                <button className="btn-primary" disabled={actionLoading} onClick={() => runAction(resolvePayrollEscalation)}>
                  Resolved — Send Back
                </button>
                {canEscalateToCEO && (
                  <button className="btn-secondary" disabled={actionLoading} onClick={() => runAction(escalatePayrollToCEO)}>
                    Escalate to CEO
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}