import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

export default function DashboardLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const subscriptionEnabled = false;
  const subscription = user?.schoolId?.subscription;
  const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
  const hasPaidAccess = user?.role === 'super_admin'
    || (subscription?.status === 'active' && subscription?.plan !== 'free' && (!endDate || endDate >= new Date()));

  if (subscriptionEnabled && !hasPaidAccess && location.pathname !== '/subscription') {
    return <Navigate to="/subscription" replace />;
  }

  return (
    <div className="min-h-screen app-shell">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
