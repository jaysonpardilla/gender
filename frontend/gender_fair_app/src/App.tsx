import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import NewAnalysis from './pages/textAnalyzer';
import UploadDocument from './pages/UploadDocument';
import AnalysisHistory from './pages/AnalysisHistory';
import ProfileSettings from './pages/ProfileSettings';
import WordGuide from './pages/WordGuide';
import HelpAndSupport from './pages/HelpAndSupport';
import Reports from './pages/Reports';
import { authService } from './services/authService';
import './App.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return authService.isAuthenticated() ? <>{children}</> : <Navigate to="/login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = authService.getUser();
  if (!user) {
    return <Navigate to="/login" />;
  }
  return user?.profile?.role === 'admin' ? <>{children}</> : <Navigate to="/" />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <UserDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/new-analysis"
          element={
            <PrivateRoute>
              <NewAnalysis />
            </PrivateRoute>
          }
        />
        <Route
          path="/upload-document"
          element={
            <PrivateRoute>
              <UploadDocument />
            </PrivateRoute>
          }
        />
        <Route
          path="/history"
          element={
            <PrivateRoute>
              <AnalysisHistory />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile-settings"
          element={
            <PrivateRoute>
              <ProfileSettings />
            </PrivateRoute>
          }
        />
        <Route
          path="/word-guide"
          element={
            <PrivateRoute>
              <WordGuide />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <Reports />
            </PrivateRoute>
          }
        />
        <Route
          path="/help-support"
          element={
            <PrivateRoute>
              <HelpAndSupport />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
      </Routes>
    </Router>
  );
}
