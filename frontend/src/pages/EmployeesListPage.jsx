import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEmployees } from "../api/employees";

export default function EmployeesListPage() {
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState({ state: "loading", message: "" });

  useEffect(() => {
    getEmployees()
      .then((data) => {
        setEmployees(data);
        setStatus({ state: "success", message: "" });
      })
      .catch((err) => {
        const message = err.response && err.response.data && err.response.data.message
          ? err.response.data.message
          : "Failed to load employees";
        setStatus({ state: "error", message });
      });
  }, []);

  return (
    <div className="page-content">
      <p className="eyebrow">Employees</p>
      <h1>Employee Registry</h1>

      {status.state === "loading" && <p className="muted">Loading...</p>}
      {status.state === "error" && <p className="msg error">{status.message}</p>}

      {status.state === "success" && employees.length === 0 && (
        <p className="muted">No employees yet - these appear once an onboarding record is approved.</p>
      )}

      {status.state === "success" && employees.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Employer of Record</th>
                <th>Designation</th>
                <th>Date of Joining</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e._id}>
                  <td>{e.employeeName}</td>
                  <td>{e.company ? e.company.name : "-"}</td>
                  <td>{e.employerOfRecord || "-"}</td>
                  <td>{e.designation}</td>
                  <td>{new Date(e.dateOfJoining).toLocaleDateString()}</td>
                  <td>
                    <span className={e.employmentStatus === "Active" ? "badge badge-approved" : "badge badge-draft"}>
                      {e.employmentStatus}
                    </span>
                  </td>
                  <td><Link to={`/employees/${e._id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}