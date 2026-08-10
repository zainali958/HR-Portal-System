import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOnboardingRecords } from "../api/onboarding";
import StatusBadge from "../components/StatusBadge";

export default function OnboardingListPage() {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState({ state: "loading", message: "" });

  useEffect(() => {
    getOnboardingRecords()
      .then((data) => {
        setRecords(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        const message = err.response && err.response.data && err.response.data.message
          ? err.response.data.message
          : "Failed to load onboarding records";
        setStatus({ state: "error", message });
      });
  }, []);

  return (
    <div className="page-content">
      <p className="eyebrow">Onboarding</p>
      <div className="page-header">
        <h1>Onboarding Records</h1>
        <Link to="/onboarding/new" className="btn-primary">+ Add Existing Employee</Link>
      </div>
      <p className="muted" style={{ marginTop: "-0.6rem" }}>
        New hires start onboarding from their approved Offer. Use "Add Existing Employee" for staff
        who never went through the Offer pipeline in this system.
      </p>

      {status.state === "loading" && <p className="muted">Loading...</p>}
      {status.state === "error" && <p className="msg error">{status.message}</p>}

      {status.state === "success" && records.length === 0 && (
        <p className="muted">
          No onboarding records yet - these appear once an approved offer's candidate has accepted.
        </p>
      )}

      {status.state === "success" && records.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Company</th>
                <th>Employer of Record</th>
                <th>CNIC</th>
                <th>Status</th>
                <th>Employment Status</th>
                <th>Synced to Sheet</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._id}>
                  <td>{r.employeeName}</td>
                  <td>{r.company && r.company.name ? r.company.name : "-"}</td>
                  <td>{r.employerOfRecord || "-"}</td>
                  <td>{r.cnic}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.employmentStatus}</td>
                  <td>{r.syncedToSheetAt ? new Date(r.syncedToSheetAt).toLocaleDateString() : "Not yet"}</td>
                  <td><Link to={`/onboarding/${r._id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
