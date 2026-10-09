import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Only display full-screen loading spinner if user is completely unknown AND loading is true
  if (loading && !user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f5f5f7]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <img src="/logo.png" alt="SafeCrowd" className="w-12 h-12 object-contain animate-pulse drop-shadow-sm" />
            <div className="absolute inset-0 rounded-full border-2 border-[#0071e3]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#0071e3] animate-spin" />
          </div>
          <div className="space-y-1 text-center">
            <div className="text-sm text-slate-800 font-semibold tracking-tight">
              SafeCrowd Control Room
            </div>
            <div className="text-xs text-slate-400 font-mono">
              resolving authentication state…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
