import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Clock,
  User,
  BookOpen,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import '../styles/Sidebar.css';

interface SidebarProps {
  onLogout?: () => void;
}


const Sidebar: React.FC<SidebarProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: FileText, label: 'Text Analyzer', path: '/new-analysis' },
    { icon: Clock, label: 'Upload Document', path: '/upload-document' },
    { icon: Clock, label: 'Analysis History', path: '/history' },
    { icon: ShieldCheck, label: 'Reports', path: '/reports' },
  ];

  const resources = [ 
    { icon: BookOpen, label: 'Word Guide', path: '/word-guide' },
    { icon: HelpCircle, label: 'Help & Support', path: '/help-support' }, 
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
  };


  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="sidebar">
      {/* Logo Section */}
      <div className="sidebar-header">
        <div>
          <h3>Gender Fair System</h3>
          <p>Bias Word Detector</p>
        </div>
      </div>

      {/* Main Menu */}
      <div className="sidebar-section">
        <nav className="sidebar-menu">
          {menuItems.map((item) => (
            <button
              key={item.path}
              className={`menu-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => handleNavigate(item.path)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav> 
        <div className="sidebar-resources">
          <h4>RESOURCES</h4>
          <nav className="sidebar-menu">
            {resources.map((item) => (
              <button
                key={item.path}
                className={`menu-item resource-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => handleNavigate(item.path)}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      <div className="sidebar-bottom Profile-Bottom">
        <button
          className={`menu-item profile-item ${isActive('/profile-settings') ? 'active' : ''}`}
          onClick={() => handleNavigate('/profile-settings')}
        >
          <User size={21} />
          <span className="menu-item-text">My Profile</span>
        </button>
      </div>

      {/* Resources Section */}
      
    </div>
  );
};

export default Sidebar;
