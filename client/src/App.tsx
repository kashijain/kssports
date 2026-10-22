import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { CustomerDetail, Customers } from './pages/Customers';
import { Dashboard } from './pages/Dashboard';
import { Forgot, Login, Register, Reset } from './pages/AuthPages';
import { InvoiceForm } from './pages/InvoiceForm';
import { InvoiceView } from './pages/InvoiceView';
import { Invoices } from './pages/Invoices';
import { Payments } from './pages/Payments';
import { Catalog } from './pages/Catalog';
import { DocumentsPage } from './pages/Documents';
import { Expenses } from './pages/Expenses';
import { Machines } from './pages/Machines';
import { ProductDetail } from './pages/ProductDetail';
import { Products } from './pages/Products';
import { Purchases } from './pages/Purchases';
import { Sales } from './pages/Sales';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { Setup } from './pages/Setup';
import { SharePage } from './pages/Share';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset/:token" element={<Reset />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route element={<RequireUser />}>
        <Route path="/setup" element={<Setup />} />
        <Route element={<RequireBusiness />}>
          <Route element={<Shell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/new" element={<InvoiceForm />} />
            <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
            <Route path="/invoices/:id" element={<InvoiceView />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/machines/:id" element={<Machines />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireUser() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function RequireBusiness() {
  const { business, loading } = useAuth();
  if (loading) return <Loading />;
  if (!business) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner />
    </div>
  );
}
