import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, updateDoc, deleteField, doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import artihcusLogo from '../../assets/AMS.png';
 
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();
  const db = getFirestore();
 
  useEffect(() => {
    setEmail("");
    setPassword("");
  }, []);
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
 
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
 
    try {
      let userData; // Data from the Firestore user document found by email
      let userDocId;
      let userDocRefByEmail; // Reference to the document found by email
 
      // 1. Check for existing user in Firestore by email
      const usersQuery = query(collection(db, "users"), where("email", "==", email));
      const userSnapshot = await getDocs(usersQuery);
 
      if (!userSnapshot.empty) {
        userData = userSnapshot.docs[0].data();
        userDocId = userSnapshot.docs[0].id;
        userDocRefByEmail = userSnapshot.docs[0].ref;
 
        // Check if user already has an auth account
        const signInMethods = await fetchSignInMethodsForEmail(auth, email);
       
        if (userData.status === 'pending' && userData.password && signInMethods.length === 0) {
          // Only create auth account if user doesn't already have one
          try {
            // Use the temporary password to create the Firebase Auth account
            await createUserWithEmailAndPassword(auth, email, userData.password);
          } catch (authError) {
            if (authError.code === 'auth/email-already-in-use') {
              console.log('Auth account already exists, proceeding to sign in');
            } else {
              console.error('Error creating Auth account for pending user:', authError);
              setError("Failed to activate account. Please try again.");
              return;
            }
          }
        }
      } else {
        setError("Invalid email or password");
        return;
      }
 
      // 2. Sign in the user
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const actualUid = userCredential.user.uid; // Get the actual Firebase Auth UID
 
      // 3. Handle UID migration/synchronization if the Firestore document ID is temporary
      if (userDocId !== actualUid) {
        console.log(`UID mismatch: Firestore ID (${userDocId}) vs Auth UID (${actualUid}). Migrating document.`);
        // Create a new document with the actual Firebase Auth UID
        const newUserDocRef = doc(db, 'users', actualUid);
        // Copy all data from the old document, add status: 'active', and remove password
        const updatedUserData = { ...userData, status: 'active' };
        delete updatedUserData.password; // Ensure temporary password is not copied
        await setDoc(newUserDocRef, updatedUserData);
        console.log('New user document created with actual UID.', newUserDocRef.id);
        // Delete the old temporary document
        await deleteDoc(userDocRefByEmail);
        console.log('Old temporary user document deleted.', userDocRefByEmail.id);
        // Update userDocRef and userData to point to the new, correct document for subsequent operations
        userData = updatedUserData;
        userDocId = actualUid;
        // We don't need userDocRefByEmail anymore after deletion
      } else if (userData.status === 'pending') {
        // If UIDs match but status is still pending, update existing document
        console.log('UIDs match, but status pending. Updating existing document.');
        await updateDoc(userDocRefByEmail, {
          status: 'active',
          password: deleteField() // Remove the temporary password field
        });
      }
 
      // 4. After migration or if not pending, check by UID. If the document exists and is not disabled, allow login. If not, block login and show error.
      const userDocRef = doc(db, 'users', actualUid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        console.log('Login: Blocked login - user document does not exist for UID:', actualUid, email);
        await auth.signOut();
        setError('Your account has been deleted by the admin.');
        return;
      }
      const latestUserData = userDocSnap.data();
      if (latestUserData.status === 'disabled') {
        console.log('Login: Blocked login - user is disabled for UID:', actualUid, email);
        await auth.signOut();
        setError('Your account has been disabled by the admin.');
        return;
      }
 
      // 💾 Save login state and user data
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userRole", userData.role);
      localStorage.setItem("userId", userDocId); // Use the (potentially updated) userDocId
      localStorage.setItem("userInfo", JSON.stringify({
        name: `${userData.firstName} ${userData.lastName}`,
        empId: userData.empId,
        clientId: userData.clientId,
        role: userData.role,
        // Include project if it exists in userData for consistency
        project: userData.project || null
      }));
 
      // 🚀 Redirect based on role or redirect param
      const params = new URLSearchParams(location.search);
      const redirect = params.get('redirect');
      if (redirect) {
        navigate(redirect, { replace: true });
        return;
      }
      const role = userData.role?.toLowerCase();
      switch (role) {
        case 'admin':
          navigate("/admin");
          break;
        case 'employee':
          navigate("/employeedashboard");
          break;
        case 'client':
          navigate("/clientdashboard");
          break;
        case 'project_manager':
          navigate("/project-manager-dashboard");
          break;
        case 'client_head':
          navigate("/client-head-dashboard");
          break;
        default:
          navigate("/access-denied");
      }
 
    } catch (err) {
      console.error("Login error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Invalid email or password");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    }
  };
 
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm lg:w-96 mx-auto">
        <div className="flex justify-center mb-6">
          <img src={artihcusLogo} alt="Artihcus Logo" className="h-16 w-auto" />
        </div>
        <div>
          <h2 className="text-4xl font-bold text-gray-900 mb-2">
            Welcome!
          </h2>
          <p className="text-gray-600 mb-8">
            Simplify your workflow and boost your productivity<br />
            with Artihcus. <span className="text-orange-500 font-medium">Get started ..</span>
          </p>
        </div>
 
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
 
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-full bg-gray-50 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
 
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-full bg-gray-50 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div
              className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? (
                <FaEyeSlash className="h-5 w-5 text-gray-400" />
              ) : (
                <FaEye className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </div>
 
          <div className="flex justify-end">
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-800"
              onClick={() => navigate("/forgot-password")}
            >
              Forgot Password?
            </button>
          </div>
 
          <button
            type="submit"
            className="w-full bg-orange-500 text-white py-3 px-4 rounded-full font-medium hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-200"
          >
            Login
          </button>
        </form>
 
       
      </div>
    </div>
  );
};
 
export default Login;
 
 