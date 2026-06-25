import React from 'react';
import { LogOut, AlertCircle } from 'lucide-react';
import '../styles/LogoutConfirmationDialog.css';

interface LogoutConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const LogoutConfirmationDialog: React.FC<LogoutConfirmationDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const handleConfirm = async () => {
    await onConfirm();
  };

  if (!isOpen) return null;

  return (
    <div className="logout-dialog-overlay" onClick={onCancel}>
      <div className="logout-dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="logout-dialog-icon">
          <AlertCircle size={48} />
        </div>

        <h2 className="logout-dialog-title">Confirm Logout</h2>

        <p className="logout-dialog-message">
          Are you sure you want to logout? You'll need to log in again to access your account.
        </p>

        <div className="logout-dialog-actions">
          <button
            className="btn-logout-cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="btn-logout-confirm"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Logging out...
              </>
            ) : (
              <>
                <LogOut size={16} />
                Logout
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutConfirmationDialog;
