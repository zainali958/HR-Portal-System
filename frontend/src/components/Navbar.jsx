import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout, isUnitManager, isHR, isCEO, isAccountant, isFinance } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const canSeeOffers = isUnitManager || isHR || isCEO;
  const canSeeEmployees = isUnitManager || isHR || isCEO;
  const canSeePayroll = isHR || isCEO || isAccountant || isFinance;
  // Onboarding is visible to everyone - every role legitimately interacts
  // with some part of it (submit/edit, overall approval, or bank details).

  return (
    <header className="navbar">
      <div className="navbar-brand">AmanorX HR Portal</div>
      <nav className="navbar-links">
        {canSeeOffers && <Link to="/offers">Offers</Link>}
        <Link to="/onboarding">Onboarding</Link>
        {canSeeEmployees && <Link to="/employees">Employees</Link>}
        {canSeePayroll && <Link to="/payroll">Payroll</Link>}
      </nav>
      <div className="navbar-user">
        <span>
          {user.fullName} <span className="muted">({user.role}{user.company ? ` — ${user.company}` : ""})</span>
        </span>
        <button className="btn-secondary" onClick={handleLogout}>Log out</button>
      </div>
    </header>
  );
}