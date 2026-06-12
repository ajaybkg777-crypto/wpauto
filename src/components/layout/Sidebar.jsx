import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HomeIcon,
  UsersIcon,
  MegaphoneIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ChartBarIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
  { name: 'WhatsApp Setup', path: '/whatsapp-setup', icon: ChatBubbleLeftRightIcon },
  { name: 'Live Chat', path: '/live-chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Contacts', path: '/leads', icon: UsersIcon },
  { name: 'Broadcast', path: '/broadcast', icon: MegaphoneIcon },
  { name: 'Templates', path: '/templates', icon: DocumentTextIcon },
  { name: 'Flows', path: '/flows', icon: ClipboardDocumentListIcon },
  { name: 'Automation', path: '/chatbot', icon: BoltIcon },
  { name: 'Analytics', path: '/analytics', icon: ChartBarIcon },
  { name: 'Subscription', path: '/subscription', icon: CreditCardIcon },
  { name: 'Settings', path: '/settings', icon: Cog6ToothIcon }
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { logout, user } = useAuth();

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg bg-primary text-white shadow-lg"
        >
          {isOpen ? (
            <XMarkIcon className="w-6 h-6" />
          ) : (
            <Bars3Icon className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 flex h-full w-64 flex-col app-sidebar shadow-xl z-40
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-black/10">
              <span className="text-primary font-bold text-xl">W</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">WaAuto</h1>
              <p className="text-xs text-white/60">School Automation</p>
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center">
              <span className="text-primary font-semibold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                {user?.name}
              </p>
                <p className="text-xs text-white/60 truncate">
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="min-h-0 flex-1 p-4 space-y-1 sidebar-scroll">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${isActive 
                    ? 'bg-white text-primary shadow-lg shadow-black/10'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="shrink-0 p-4 border-t border-white/10">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-white/70 rounded-lg hover:bg-white/10 hover:text-white transition-all duration-200"
          >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
