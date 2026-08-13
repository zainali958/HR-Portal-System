import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import OffersListPage from "./pages/OffersListPage";
import OfferWizardPage from "./pages/OfferWizardPage";
import OfferDetailPage from "./pages/OfferDetailPage";
import OnboardingListPage from "./pages/OnboardingListPage";
import OnboardingFormPage from "./pages/OnboardingFormPage";
import OnboardingDetailPage from "./pages/OnboardingDetailPage";
import EmployeesListPage from "./pages/EmployeesListPage";
import EmployeeDetailPage from "./pages/EmployeeDetailPage";
import PayrollListPage from "./pages/PayrollListPage";
import PayrollCreatePage from "./pages/PayrollCreatePage";
import PayrollDetailPage from "./pages/PayrollDetailPage";

export default function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Navbar />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/" element={<Navigate to="/offers" replace />} />

          <Route path="/offers" element={
  <ProtectedRoute allowedRoles={["Unit Manager", "HR", "CEO"]}><OffersListPage /></ProtectedRoute>
} />
<Route path="/offers/new" element={
  <ProtectedRoute allowedRoles={["Unit Manager", "HR", "CEO"]}><OfferWizardPage /></ProtectedRoute>
} />
<Route path="/offers/:id" element={
  <ProtectedRoute allowedRoles={["Unit Manager", "HR", "CEO"]}><OfferDetailPage /></ProtectedRoute>
} />

<Route path="/onboarding" element={
  <ProtectedRoute><OnboardingListPage /></ProtectedRoute>
} />
<Route path="/onboarding/new" element={
  <ProtectedRoute allowedRoles={["Unit Manager"]}><OnboardingFormPage /></ProtectedRoute>
} />
<Route path="/onboarding/:id" element={
  <ProtectedRoute><OnboardingDetailPage /></ProtectedRoute>
} />

<Route path="/employees" element={
  <ProtectedRoute allowedRoles={["Unit Manager", "HR", "CEO"]}><EmployeesListPage /></ProtectedRoute>
} />
<Route path="/employees/:id" element={
  <ProtectedRoute allowedRoles={["Unit Manager", "HR", "CEO"]}><EmployeeDetailPage /></ProtectedRoute>
} />

<Route path="/payroll" element={
  <ProtectedRoute allowedRoles={["HR", "CEO", "Accountant", "Finance"]}><PayrollListPage /></ProtectedRoute>
} />
<Route path="/payroll/new" element={
  <ProtectedRoute allowedRoles={["HR", "CEO", "Accountant", "Finance"]}><PayrollCreatePage /></ProtectedRoute>
} />
<Route path="/payroll/:id" element={
  <ProtectedRoute allowedRoles={["HR", "CEO", "Accountant", "Finance"]}><PayrollDetailPage /></ProtectedRoute>
} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
