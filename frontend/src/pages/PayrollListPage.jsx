import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPayrollCycles } from "../api/payroll";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function PayrollListPage() {
  const { isHR } = useAuth();
  const [cycles, setCycles] = useState([]);
  const [status, setStatus] = useState({ state: "loading", message: "" });

  useEffect(() => {
    getPayrollCycles()
      .then((data) => {
        setCycles(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        setStatus({ state: "error", message: err.response?.data?.message || "Failed to load payroll cycles" });
      });
  }, []);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <p className="eyebrow">Payroll</p>
          <h1>Payroll Cycles</h1>
        </div>
        {isHR && <Link to="/payroll/new" className="btn-primary btn-link">+ New Payroll Cycle</Link>}
      </div>

      {status.state === "loading" && <p className="muted">Loading...</p>}
      {status.state === "error" && <p className="msg error">{status.message}</p>}

      {status.state === "success" && cycles.length === 0 && (
        <p className="muted">No payroll cycles yet.</p>
      )}

      {status.state === "success" && cycles.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Company</th>
                <th>Employees</th>
                <th>Total Proposed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => {
                const total = c.entries.reduce((sum, e) => sum + (e.proposedAmount || 0), 0);
                return (
                  <tr key={c._id}>
                    <td>{c.month}</td>
                    <td>{c.company ? c.company.name : "-"}</td>
                    <td>{c.entries.length}</td>
                    <td>{total.toLocaleString()}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><Link to={`/payroll/${c._id}`}>View</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}