import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LogoutConfirmationDialog from './LogoutConfirmationDialog';
import { authService } from '../services/authService';
import logo from '../assets/logo.png';
import '../styles/Navigation.css';

interface NavigationProps {
  userEmail?: string;
  userInitials?: string;
  onLogout?: () => void;
}

const Navigation: React.FC<NavigationProps> = ({
  userEmail = 'User',
  userInitials = 'U',
  onLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="navigation-bar">
      <div className="nav-left">
        <div className="logo-section">
          <img src={logo} alt="Gender Fair System Logo" className="logo-image" />
          <h1 className="logo-title"><b>FairScript</b></h1>
        </div>
      </div>

      <div className="nav-right">
        {/* User Profile with dropdown (wrap both so outside-click detection includes dropdown) */}
        <div className="user-menu" ref={wrapperRef}>
          <div className="user-profile" onClick={() => setMenuOpen(!menuOpen)} role="button" aria-haspopup="true" aria-expanded={menuOpen}>
            <div className="user-avatar">{userInitials}</div>
            <div className="user-info">
                <p className="user-name">{userEmail}</p>
            </div>
              <div className={`dropdown-indicator ${menuOpen ? 'open' : ''}`} aria-hidden>
                <ChevronDown size={16} />
              </div>
          </div>

          {menuOpen && (
            <div className="user-dropdown" role="menu">
              <button
                className="dropdown-logout"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setIsLogoutDialogOpen(true);
                }}
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <LogoutConfirmationDialog
        isOpen={isLogoutDialogOpen}
        isLoading={isLoggingOut}
        onCancel={() => setIsLogoutDialogOpen(false)}
        onConfirm={async () => {
          setIsLoggingOut(true);
          try {
            try {
              await authService.logoutBackend?.();
            } catch (err) {
              console.error('Backend logout failed:', err);
            }

            if (onLogout) {
              onLogout();
            } else {
              authService.logout();
              navigate('/login');
            }
          } finally {
            setIsLoggingOut(false);
            setIsLogoutDialogOpen(false);
          }
        }}
      />
    </div>
  );
};

export default Navigation;
