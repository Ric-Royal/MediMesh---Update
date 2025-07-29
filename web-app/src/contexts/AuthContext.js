import React, { createContext, useContext, useState, useEffect } from 'react';
import Keycloak from 'keycloak-js';
import apiService from '../services/api';

const AuthContext = createContext();

// Keycloak configuration
const keycloakConfig = {
  url: process.env.REACT_APP_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.REACT_APP_KEYCLOAK_REALM || 'medimesh',
  clientId: process.env.REACT_APP_KEYCLOAK_CLIENT_ID || 'medimesh-client'
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keycloak, setKeycloak] = useState(null);
  const [token, setToken] = useState(null);
  const [developmentMode, setDevelopmentMode] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // Check if we're explicitly in development mode
      const isDevMode = process.env.REACT_APP_DEV_MODE === 'true' || 
                       process.env.NODE_ENV === 'development';
      
      if (isDevMode) {
        console.log('Initializing development authentication mode');
        initDevelopmentAuth();
      } else {
        // Production mode - try Keycloak
        try {
          await initKeycloak();
        } catch (error) {
          console.error('Keycloak initialization failed:', error);
          console.log('Falling back to development authentication');
          initDevelopmentAuth();
        }
      }
    };

    initAuth();
  }, []);

  const initKeycloak = async () => {
    try {
      const kc = new Keycloak(keycloakConfig);
      
      const authenticated = await kc.init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        checkLoginIframe: false
      });

      setKeycloak(kc);

      if (authenticated) {
        setIsAuthenticated(true);
        setToken(kc.token);
        
        // Get user profile
        const profile = await kc.loadUserProfile();
        setUser({
          id: kc.subject,
          username: kc.tokenParsed.preferred_username,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          roles: kc.tokenParsed.realm_access?.roles || [],
          fullName: `${profile.firstName} ${profile.lastName}`.trim()
        });

        // Set up token refresh
        kc.onTokenExpired = () => {
          kc.updateToken(30).then((refreshed) => {
            if (refreshed) {
              setToken(kc.token);
              console.log('Token refreshed');
            } else {
              console.log('Token still valid');
            }
          }).catch(() => {
            console.error('Failed to refresh token');
            logout();
          });
        };
      }
      setLoading(false);
    } catch (error) {
      throw error;
    }
  };

  const initDevelopmentAuth = async () => {
    console.log('Setting up development authentication mode');
    setDevelopmentMode(true);
    
    // Check if we have a stored development token
    const devToken = localStorage.getItem('dev_token');
    if (devToken) {
      try {
        console.log('Found existing dev token, verifying...');
        // Verify token with development backend
        const response = await apiService.auth.me();
        console.log('Token verified, user authenticated');
        setUser(response);
        setIsAuthenticated(true);
        setToken(devToken);
      } catch (error) {
        console.log('Stored token invalid, removing it');
        // Token invalid, remove it
        localStorage.removeItem('dev_token');
      }
    } else {
      console.log('No existing token found, user needs to login');
    }
    setLoading(false);
  };

  const login = async (username, password) => {
    if (developmentMode) {
      // Development login
      try {
        setLoading(true);
        const response = await apiService.auth.login(username, password);
        
        // Store token
        localStorage.setItem('dev_token', response.access_token);
        setToken(response.access_token);
        
        // Set user data
        setUser(response.user);
        setIsAuthenticated(true);
        
        return { success: true };
      } catch (error) {
        console.error('Development login error:', error);
        return { 
          success: false, 
          error: error?.response?.data?.error || error?.message || 'Login failed' 
        };
      } finally {
        setLoading(false);
      }
    } else if (keycloak) {
      // Production Keycloak login
      keycloak.login();
      return { success: true };
    } else {
      return { success: false, error: 'Authentication system not initialized' };
    }
  };

  const logout = async () => {
    if (developmentMode) {
      // Development logout
      try {
        await apiService.auth.logout();
      } catch (error) {
        console.error('Development logout error:', error);
      }
      localStorage.removeItem('dev_token');
      setUser(null);
      setIsAuthenticated(false);
      setToken(null);
    } else if (keycloak) {
      // Production Keycloak logout
      keycloak.logout({
        redirectUri: window.location.origin
      });
    }
  };

  const hasRole = (role) => {
    return user?.roles?.includes(role) || false;
  };

  const hasAnyRole = (roles) => {
    return roles.some(role => hasRole(role));
  };

  const getAuthHeaders = () => {
    if (token) {
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'Content-Type': 'application/json'
    };
  };

  const value = {
    isAuthenticated,
    user,
    loading,
    token,
    keycloak,
    developmentMode,
    login,
    logout,
    hasRole,
    hasAnyRole,
    getAuthHeaders
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 