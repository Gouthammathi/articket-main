import React, { useState, useEffect } from 'react'
import Layout from './components/Layout/Layout'
 
function App() {
  const [showMobilePopup, setShowMobilePopup] = useState(false);
 
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        setShowMobilePopup(true);
      } else {
        setShowMobilePopup(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
 
  return (
    <div className="relative">
      {showMobilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-xs text-center">
            <h2 className="text-lg font-bold mb-4">Please use desktop for better use</h2>
            <p className="text-gray-600 mb-4">This application is best experienced on a desktop device.</p>
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold"
              onClick={() => setShowMobilePopup(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <Layout />
    </div>
  )
}
 
export default App
 