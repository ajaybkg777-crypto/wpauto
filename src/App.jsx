import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/layout/PrivateRoute';
import DashboardLayout from './components/layout/DashboardLayout';

// Pages
import Landing from './pages/landing/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import Leads from './pages/leads/Leads';
import LeadDetail from './pages/leads/LeadDetail';
import Broadcast from './pages/broadcast/Broadcast';
import CreateBroadcast from './pages/broadcast/CreateBroadcast';
import Chatbot from './pages/chatbot/Chatbot';
import Templates from './pages/templates/Templates';
import Flows from './pages/flows/Flows';
import Subscription from './pages/subscription/Subscription';
import Settings from './pages/dashboard/Settings';
import WhatsAppSetup from './pages/dashboard/WhatsAppSetup';
import Analytics from './pages/dashboard/Analytics';

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Toaster 
          position="top-right" 
          toastOptions={{
            duration: 4000,
            style: {
              background: '#075E54',
              color: '#fff',
            },
          }}
        />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected Routes */}
          <Route element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="whatsapp-setup" element={<WhatsAppSetup />} />
            <Route path="leads" element={<Leads />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="broadcast" element={<Broadcast />} />
            <Route path="broadcast/create" element={<CreateBroadcast />} />
            <Route path="templates" element={<Templates />} />
            <Route path="flows" element={<Flows />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="settings" element={<Settings />} />
            <Route path="analytics" element={<Analytics />} />
          </Route>
          
          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
