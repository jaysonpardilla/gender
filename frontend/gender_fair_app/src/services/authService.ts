/* eslint-disable @typescript-eslint/no-explicit-any */
import api from './api';

export const authService = {
  signup: (data: {
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    password_confirm: string;
    role: 'user' | 'admin';
  }) => api.post('/auth/signup/', data),

  login: (email: string, password: string) =>
    api.post('/auth/login/', { email, password }),

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  setTokens: (access: string, refresh: string, user: any) => {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user', JSON.stringify(user));
  },

  getUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  getCurrentUser: () => api.get('/auth/user/'),

  updateCurrentUser: (data: any) => api.patch('/auth/user/', data),

  changePassword: (data: { current_password: string; new_password: string; password_confirm: string }) =>
    api.post('/auth/change-password/', data),

  logoutBackend: () => api.post('/auth/logout/'),

  isAuthenticated: () => !!localStorage.getItem('access_token'),
  // Public check to see if an admin user already exists (backend may implement '/auth/admin-exists/')
  checkAdminExists: () => api.get('/auth/admin-exists/'),
};

export const analysisService = {
  analyzeText: (text: string) =>
    api.post('/analyze-text/', { text }),

  uploadDocument: (
    file: File,
    options?: AbortSignal | { signal?: AbortSignal; approved_replacements_count?: number }
  ) => {
    const formData = new FormData();
    formData.append('file', file);

    const config: any = {};
    if (options instanceof AbortSignal) {
      config.signal = options;
    } else if (options && typeof options === 'object') {
      if (options.signal) {
        config.signal = options.signal;
      }
      if (options.approved_replacements_count != null) {
        formData.append('approved_replacements_count', String(options.approved_replacements_count));
      }
    }

    return api.post('/upload-document/', formData, config);
  },

  getUserHistory: () =>
    api.get('/history/'),

  getDocumentDetail: (docId: number) =>
    api.get(`/document/${docId}/`),

  deleteDocument: (docId: number) =>
    api.delete(`/document/${docId}/`),

  downloadCorrectedDocument: (documentId: number) =>
    api.get(`/document/${documentId}/download/`, { responseType: 'blob' }),

  generateCorrectedFile: (originalText: string, replacements: any[], fileType: string, fileName: string) =>
    api.post('/generate-corrected-file/', 
      { original_text: originalText, replacements, file_type: fileType, file_name: fileName },
      { responseType: 'blob' }
    ),

  // Dashboard API endpoints
  getDashboardStats: () =>
    api.get('/dashboard/stats/'),

  getDashboardRecentAnalyses: (limit?: number) => {
    const params = limit ? { limit } : {};
    return api.get('/dashboard/recent-analyses/', { params });
  },

  getDashboardTopBiasWords: (limit?: number) => {
    const params = limit ? { limit } : {};
    return api.get('/dashboard/top-bias-words/', { params });
  },

  // Save analysis result (update existing document with approved replacements count)
  updateDocument: (docId: number, data: { approved_replacements_count?: number; processed_text?: string }) =>
    api.patch(`/document/${docId}/`, data),

  contactSupport: (data: { name: string; email: string; subject: string; message: string }) =>
    api.post('/support-message/', data),
};

export const adminService = {
  getAllUsers: () =>
    api.get('/admin/users/'),

  getAllDocuments: () =>
    api.get('/admin/documents/'),
  getSupportMessages: () =>
    api.get('/admin/support-messages/'),

  updateSupportMessage: (messageId: number, data: { is_resolved: boolean }) =>
    api.patch(`/admin/support-messages/${messageId}/`, data),

  getAnalytics: () =>
    api.get('/admin/analytics/'),

  getDataset: (search?: string) => {
    const params = search ? { search } : {};
    return api.get('/admin/dataset/', { params });
  },

  importDatasetFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/dataset/import/', formData);
  },

  initDataset: () =>
    api.post('/admin/init-dataset/', {}),

  addDatasetMapping: (data: { biased_word: string; fair_word: string }) =>
    api.post('/admin/dataset/', data),

  deleteDatasetMapping: (mappingId: number) =>
    api.delete(`/admin/dataset/${mappingId}/`),
};
