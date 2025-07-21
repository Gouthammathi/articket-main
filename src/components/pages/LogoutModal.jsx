import React from 'react';

const LogoutModal = ({ open, onCancel, onConfirm, loading }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl w-full max-w-sm p-6 border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Confirm Logout</h3>
        <p className="text-gray-600 mb-6">Are you sure you want to sign out?</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100/80 backdrop-blur-sm rounded-xl hover:bg-gray-200 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-gradient-to-r from-red-600/90 to-red-700/90 backdrop-blur-sm text-white rounded-xl hover:from-red-700 hover:to-red-800 transition-colors"
            disabled={loading}
          >
            {loading ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal; 