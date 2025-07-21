import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Admin from "../pages/Admin";
import ClientDashboard from '../pages/ClientDashboard';
import ClientTickets from '../pages/ClientTickets';
import EmployeeDashboard from '../pages/EmployeeDashboard';
import Login from '../pages/Login';
import AdminTickets from '../pages/AdminTickets';
import PropTypes from 'prop-types';
import Forgot from '../pages/ForgotPassword';
import Projects from "../pages/Projects";
import Ticketing from "../pages/Ticketing";
import ProjectManagerDashboard from "../pages/ProjectManagerDashboard";
import ClientHeadDashboard from "../pages/ClientHeadDashboard";
import EmployeeTickets from "../pages/EmployeeTickets";
import TicketDetailsWrapper from '../pages/TicketDetailsWrapper';
import EmployeeKPIDashboard from '../pages/EmployeeKPIDashboard';
import ClientHeadTickets from '../pages/ClientHeadTickets';
import ProjectManagerTickets from '../pages/ProjectManagerTickets';
import EditTicketForm from '../pages/EditTicketForm';
import ProjectTickets from '../pages/ProjectTickets';
 
import { auth, db } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { query, collection, where, getDocs, doc, getDoc } from 'firebase/firestore';
 
// Protected Route component
function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
 
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        // Check Firestore user status and existence
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (!userDocSnap.exists()) {
            await auth.signOut();
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
          }
          const userData = userDocSnap.data();
          if (userData.status === 'disabled') {
            await auth.signOut();
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
          }
        } catch {
          // Optionally handle error
        }
        setIsLoading(false);
      } else {
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
 
  return children;
}
ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Utility to get dashboard route for a given role
function getDashboardRouteForRole(role) {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'client_head':
      return '/client-head-dashboard';
    case 'client':
      return '/clientdashboard';
    case 'employee':
      return '/employeedashboard';
    case 'project_manager':
      return '/project-manager-dashboard';
    default:
      return '/login';
  }
}
 
// Admin Route component
function AdminRoute({ children }) {
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [userRole, setUserRole] = React.useState(null);
 
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is admin in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          setUserRole(userData.role);
          setIsAdmin(userData.role === 'admin');
        } else {
          setUserRole(null);
          setIsAdmin(false);
        }
      } else {
        setUserRole(null);
        setIsAdmin(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isAdmin) {
    // Redirect to correct dashboard for their role
    return <Navigate to={getDashboardRouteForRole(userRole)} replace />;
  }
 
  return children;
}
AdminRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Employee Route component
function EmployeeRoute({ children }) {
  const [isEmployee, setIsEmployee] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [userRole, setUserRole] = React.useState(null);
 
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is employee in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          setUserRole(userData.role);
          setIsEmployee(userData.role === 'employee');
        } else {
          setUserRole(null);
          setIsEmployee(false);
        }
      } else {
        setUserRole(null);
        setIsEmployee(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isEmployee) {
    return <Navigate to={getDashboardRouteForRole(userRole)} replace />;
  }
 
  return children;
}
EmployeeRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Client Head Route component
function ClientHeadRoute({ children }) {
  const [isClientHead, setIsClientHead] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [userRole, setUserRole] = React.useState(null);
 
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is client head in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          setUserRole(userData.role);
          setIsClientHead(userData.role === 'client_head');
        } else {
          setUserRole(null);
          setIsClientHead(false);
        }
      } else {
        setUserRole(null);
        setIsClientHead(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isClientHead) {
    return <Navigate to={getDashboardRouteForRole(userRole)} replace />;
  }
 
  return children;
}
ClientHeadRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Client Route component
function ClientRoute({ children }) {
  const [isClient, setIsClient] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [userRole, setUserRole] = React.useState(null);
 
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is client in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          setUserRole(userData.role);
          setIsClient(userData.role === 'client');
        } else {
          setUserRole(null);
          setIsClient(false);
        }
      } else {
        setUserRole(null);
        setIsClient(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isClient) {
    return <Navigate to={getDashboardRouteForRole(userRole)} replace />;
  }
 
  return children;
}
ClientRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Project Manager Route component
function ProjectManagerRoute({ children }) {
  const [isProjectManager, setIsProjectManager] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [userRole, setUserRole] = React.useState(null);
 
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is project manager in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          setUserRole(userData.role);
          setIsProjectManager(userData.role === 'project_manager');
        } else {
          setUserRole(null);
          setIsProjectManager(false);
        }
      } else {
        setUserRole(null);
        setIsProjectManager(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isProjectManager) {
    return <Navigate to={getDashboardRouteForRole(userRole)} replace />;
  }
 
  return children;
}
ProjectManagerRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// AuthRedirectRoute: Redirects authenticated users away from login/forgot-password
function AuthRedirectRoute({ children }) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [userRole, setUserRole] = React.useState(null);
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Get user role from Firestore
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          setUserRole(userData.role);
        } else {
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (userRole) {
    return <Navigate to={getDashboardRouteForRole(userRole)} replace />;
  }
 
  return children;
}
AuthRedirectRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
function Routers() {
  return (
    <Routes>
      {/* Public routes (redirect if already authenticated) */}
      <Route path="/login" element={<AuthRedirectRoute><Login /></AuthRedirectRoute>} />
      <Route path="/forgot-password" element={<AuthRedirectRoute><Forgot /></AuthRedirectRoute>} />
 
      {/* Protected routes */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Routes>
              {/* Admin-only routes */}
              <Route path="/admin" element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              } />
              <Route path="/admin-tickets" element={
                <AdminRoute>
                  <AdminTickets />
                </AdminRoute>
              } />
              <Route path="/projects" element={
                <AdminRoute>
                  <Projects />
                </AdminRoute>
              } />
              <Route path="/editTicketform" element={
                <AdminRoute>
                  <EditTicketForm />
                </AdminRoute>
              } />
              <Route path="/project-tickets" element={
                <AdminRoute>
                  <ProjectTickets />
                </AdminRoute>
              } />
 
              {/* Client Head-only routes */}
              <Route path="/client-head-dashboard" element={
                <ClientHeadRoute>
                  <ClientHeadDashboard />
                </ClientHeadRoute>
              } />
              <Route path="/client-head-tickets" element={
                <ClientHeadRoute>
                  <ClientHeadTickets />
                </ClientHeadRoute>
              } />
 
              {/* Client-only routes */}
              <Route path="/clientdashboard" element={
                <ClientRoute>
                  <ClientDashboard />
                </ClientRoute>
              } />
              <Route path="/client-tickets" element={
                <ClientRoute>
                  <ClientTickets />
                </ClientRoute>
              } />
 
              {/* Project Manager-only routes */}
              <Route path="/project-manager-dashboard" element={
                <ProjectManagerRoute>
                  <ProjectManagerDashboard />
                </ProjectManagerRoute>
              } />
              <Route path="/project-manager-tickets" element={
                <ProjectManagerRoute>
                  <ProjectManagerTickets />
                </ProjectManagerRoute>
              } />
              <Route path="/team/employee/:id" element={
                <ProjectManagerRoute>
                  <EmployeeKPIDashboard />
                </ProjectManagerRoute>
              } />
 
              {/* Employee-only routes */}
              <Route path="/employeedashboard" element={
                <EmployeeRoute>
                  <EmployeeDashboard />
                </EmployeeRoute>
              } />
              <Route path="/employee-tickets" element={
                <EmployeeRoute>
                  <EmployeeTickets />
                </EmployeeRoute>
              } />
 
              {/* Other routes (accessible to any authenticated user) */}
              <Route path="/ticketing" element={<Ticketing />} />
              <Route path="/tickets/:ticketId" element={<TicketDetailsWrapper />} />
              {/* Default: redirect to dashboard or 404 */}
              <Route path="*" element={<Navigate to="/clientdashboard" replace />} />
            </Routes>
          </ProtectedRoute>
        }
      />
      {/* Default: redirect to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
 
export default Routers;
 
 