/* eslint-disable preserve-caught-error */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Sidebar from '../components/Sidebar';
import EditContactModal from '../components/EditContactModal';
import LogoutConfirmationDialog from '../components/LogoutConfirmationDialog';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { Settings, Plus, LogOut } from 'lucide-react';
import { authService } from '../services/authService';
import '../styles/ProfileSettings.css';

const ProfileSettings: React.FC = () => {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    avatar: '',
    bio: '',
    role: '',
    analyses_count: 0,
    biased_words_detected: 0,
    average_score: 0,
    joined_at: '',
    last_login: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  const userEmail = (() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.email || 'User';
      } catch (e) {
        return 'User';
      }
    }
    return 'User';
  })();

  const getUserInitials = (): string => {
    const name = (profileData.first_name || profileData.email || userEmail).split('@')[0];
    const parts = name.split('.');
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2);
  };

  const handleLogoutClick = () => {
    setIsLogoutDialogOpen(true);
  };

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Call backend logout endpoint (if it exists)
      try {
        await authService.logoutBackend?.();
      } catch (err) {
        console.error('Backend logout call failed, proceeding with frontend logout:', err);
      }

      // Clear local storage and navigate
      authService.logout();
      setIsLogoutDialogOpen(false);
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      setIsLoggingOut(false);
    }
  };

  const handleCancelLogout = () => {
    setIsLogoutDialogOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleProfileChange = (field: string, value: string | boolean) => {
    setProfileData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const defaultAvatarUrl = 'http://localhost:8000/media/default-profile.png';
  const displayName = [profileData.first_name, profileData.last_name].filter(Boolean).join(' ') || userEmail.split('@')[0];

  useEffect(() => {
    let mounted = true;
    authService.getCurrentUser()
      .then((res) => {
        if (!mounted) return;
        const user = res.data;
        setProfileData({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
          avatar: user.profile?.avatar || '',
          bio: user.profile?.bio || '',
          role: user.profile?.role || 'User',
          analyses_count: user.profile?.analyses_count || 0,
          biased_words_detected: user.profile?.biased_words_detected || 0,
          average_score: user.profile?.average_score || 0,
          joined_at: user.date_joined || '',
          last_login: user.last_login || '',
        });
      })
      .catch((err) => {
        console.error('Failed to load user:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        profile: {
          avatar: profileData.avatar,
          bio: profileData.bio,
        },
      };
      const res = await authService.updateCurrentUser(payload);
      setStatus({ type: 'success', text: 'Profile updated successfully.' });
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          const u = JSON.parse(stored);
          const updated = {
            ...u,
            first_name: res.data.first_name,
            last_name: res.data.last_name,
            profile: res.data.profile,
          };
          localStorage.setItem('user', JSON.stringify(updated));
        } catch (e) {
          /* empty */
        }
      }
    } catch (e) {
      console.error('Save profile error', e);
      setStatus({ type: 'error', text: 'Failed to save profile.' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDeleteAccount = () => {
    if (!confirm('Delete your account and all associated data? This action cannot be undone.')) return;
    // placeholder: call API to delete account and then logout
    setStatus({ type: 'success', text: 'Account deletion requested.' });
    setTimeout(() => {
      setStatus(null);
      handleLogout();
    }, 1500);
  };

  const handleSaveContactInfo = async (contactData: {
    first_name: string;
    last_name: string;
    email: string;
  }) => {
    try {
      const payload = {
        first_name: contactData.first_name,
        last_name: contactData.last_name,
        // Email is typically not editable in user profiles for security reasons
        // but including it in the payload for completeness
        profile: {
          avatar: profileData.avatar,
          bio: profileData.bio,
        },
      };

      const res = await authService.updateCurrentUser(payload);
      setProfileData((prev) => ({
        ...prev,
        first_name: res.data.first_name || prev.first_name,
        last_name: res.data.last_name || prev.last_name,
      }));
      setStatus({ type: 'success', text: 'Contact information updated successfully.' });

      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          const u = JSON.parse(stored);
          const updated = {
            ...u,
            first_name: res.data.first_name,
            last_name: res.data.last_name,
            profile: res.data.profile,
          };
          localStorage.setItem('user', JSON.stringify(updated));
        } catch (e) {
          /* empty */
        }
      }

      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.error('Save contact info error', e);
      throw new Error('Failed to update contact information');
    }
  };

  const handleChangePassword = async (passwordData: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) => {
    try {
      const payload = {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
        password_confirm: passwordData.confirm_password,
      };

      await authService.changePassword(payload);
      setStatus({ type: 'success', text: 'Password changed successfully.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.error('Change password error', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to change password';
      throw new Error(errorMessage);
    }
  };

  return (
    <div>
      <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
      <div className="dashboard-body">
        <Sidebar onLogout={handleLogout} />
        <div className="sidebar-placeholder" />
        <div className="dashboard-content">
          <div className="profile-settings-container">
            <div className="profile-header">
              <h1>Profile Settings</h1>
              <p>Manage your account information and preferences</p>
            </div>

            <div className="profile-wrapper">
              {/* Left Sidebar */}
              <aside className="profile-left-panel">
                <div className="profile-card">
                  <div className="avatar-container">
                    <div className="avatar-wrapper">
                      <img
                        src={profileData.avatar || defaultAvatarUrl}
                        alt="avatar"
                        className="profile-avatar"
                      />
                      <label htmlFor="avatar-upload" className="avatar-overlay">
                        <Plus size={16} />
                      </label>
                    </div>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="avatar-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            handleProfileChange('avatar', event.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                  <h2 className="profile-name">{displayName}</h2>
                  <p className="profile-email">{profileData.email}</p>
                  </div>
              </aside>

              {/* Right Panel */}
              <main className="profile-right-panel">
                {/* Account Information */}
                <section className="profile-section">
                  <div className="section-header">
                    <h3>Account Information</h3>
                    <button
                      className="edit-icon-btn"
                      onClick={() => setIsContactModalOpen(true)}
                      title="Edit contact information"
                      aria-label="Edit contact information"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <path d="M3 21v-3.75L14.06 6.19a2.04 2.04 0 012.88 0l1.87 1.87a2.04 2.04 0 010 2.88L7.75 22H3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M14 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>First Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={profileData.first_name}
                        onChange={(e) => handleProfileChange('first_name', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Last Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={profileData.last_name}
                        onChange={(e) => handleProfileChange('last_name', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" className="form-control" value={profileData.email} readOnly />
                  </div>

                  <div className="form-group">
                    <label>Bio</label>
                    <textarea
                      className="form-control textarea"
                      rows={4}
                      value={profileData.bio}
                      onChange={(e) => handleProfileChange('bio', e.target.value)}
                      placeholder="Member Bio"
                    />
                  </div>
                </section>

                {/* Security Settings */}
                <section className="profile-section">
                  <div className="section-header">
                    <Settings size={18} />
                    <h3>Security Settings</h3>
                  </div>
                  <div className="security-grid">
                    {/* Change Password Card */}
                    <div className="security-card">
                      <div className="security-card-content">
                        <h4>Change Password</h4>
                        <p>Update your password to keep your account secure</p>
                      </div>
                      <button className="btn-outline btn-block" onClick={() => setIsChangePasswordModalOpen(true)}>
                        Change Password
                      </button>
                    </div>

                    {/* Delete Account Card */}
                    <div className="security-card">
                      <div className="security-card-content">
                        <h4>Delete Account</h4>
                        <p>Permanently delete your account and all data</p>
                      </div>
                      <button className="btn-danger btn-block" onClick={handleDeleteAccount}>
                        Delete Account
                      </button>
                    </div>

                    {/* Logout Card */}
                    <div className="security-card">
                      <div className="security-card-content">
                        <h4>Logout</h4>
                        <p>Sign out from your current session</p>
                      </div>
                      <button className="btn-outline btn-block" onClick={handleLogoutClick}>
                        <LogOut size={14} />
                        Logout
                      </button>
                    </div>
                  </div>
                </section>

                {/* Save Section */}
                <div className="save-section">
                  {status && <div className={`status-message status-${status.type}`}>{status.text}</div>}
                  <div className="button-group">
                    <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>

      <EditContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        onSave={handleSaveContactInfo}
        initialData={{
          first_name: profileData.first_name,
          last_name: profileData.last_name,
          email: profileData.email,
        }}
      />

      <LogoutConfirmationDialog
        isOpen={isLogoutDialogOpen}
        onConfirm={handleConfirmLogout}
        onCancel={handleCancelLogout}
        isLoading={isLoggingOut}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        onSave={handleChangePassword}
      />
    </div>
  );
};

export default ProfileSettings;
