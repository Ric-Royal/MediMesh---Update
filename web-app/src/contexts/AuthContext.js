import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime';

const AuthContext = createContext();
const authMode = RUNTIME_CONFIG.identityMode;
const keycloakConfig = {
  url: RUNTIME_CONFIG.keycloakUrl,
  realm: RUNTIME_CONFIG.keycloakRealm,
  clientId: RUNTIME_CONFIG.keycloakClientId
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keycloak, setKeycloak] = useState(null);
  const [token, setToken] = useState(null);
  // Kept for component compatibility; true means the built-in account system,
  // which is also the supported production mode.
  const [developmentMode, setDevelopmentMode] = useState(false);

  const applyLocalSession = useCallback((session) => {
    setToken('cookie-session');
    setUser({
      ...session.user,
      fullName: session.user.fullName || session.user.name || session.user.username,
    });
    setIsAuthenticated(true);
  }, []);

  const initKeycloak = useCallback(async () => {
    // Keep the optional identity-provider client out of the default local
    // authentication bundle and load it only when explicitly configured.
    const { default: Keycloak } = await import('keycloak-js');
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
      const profile = await kc.loadUserProfile();
      setUser({
        id: kc.subject,
        username: kc.tokenParsed.preferred_username,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        roles: kc.tokenParsed.realm_access?.roles || [],
        fullName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
      });
      kc.onTokenExpired = () => kc.updateToken(30)
        .then(refreshed => { if (refreshed) setToken(kc.token); })
        .catch(() => kc.logout({ redirectUri: window.location.origin }));
    }
    setLoading(false);
  }, []);

  const initLocalAuth = useCallback(async () => {
    setDevelopmentMode(true);
    try {
      const response = await apiService.auth.me();
      setUser({ ...response, fullName: response.fullName || response.name || response.username });
      setIsAuthenticated(true);
      setToken('cookie-session');
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      if (authMode === 'local') {
        await initLocalAuth();
        return;
      }
      try {
        await initKeycloak();
      } catch (error) {
        console.error('Configured Keycloak authentication could not initialize:', error);
        setLoading(false);
      }
    };
    initialize();
  }, [initKeycloak, initLocalAuth]);

  const login = async (username, password) => {
    if (!developmentMode) {
      if (keycloak) {
        keycloak.login();
        return { success: true };
      }
      return { success: false, error: 'Authentication system not initialized' };
    }
    try {
      const response = await apiService.auth.login(username, password);
      if (response.mfaRequired) {
        return { success: true, mfaRequired: true, mfaToken: response.mfa_token };
      }
      applyLocalSession(response);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error?.message || 'Login failed' };
    }
  };

  const verifyMfa = async (mfaToken, code) => {
    try {
      applyLocalSession(await apiService.auth.verifyMfa(mfaToken, code));
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error.message || 'MFA verification failed' };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!developmentMode) return { success: false, error: 'Password changes are managed by your identity provider.' };
    try {
      const session = await apiService.auth.changePassword(currentPassword, newPassword);
      applyLocalSession(session);
      return { success: true, message: session.message };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error?.message || 'Password change failed' };
    }
  };

  const setupMfa = async () => {
    try {
      return { success: true, data: await apiService.auth.setupMfa() };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error.message || 'MFA setup failed' };
    }
  };

  const enableMfa = async code => {
    try {
      const session = await apiService.auth.enableMfa(code);
      applyLocalSession(session);
      return { success: true, message: session.message };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error.message || 'MFA enable failed' };
    }
  };

  const disableMfa = async (password, code) => {
    try {
      const session = await apiService.auth.disableMfa(password, code);
      applyLocalSession(session);
      return { success: true, message: session.message };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error.message || 'MFA disable failed' };
    }
  };

  const openAccountManagement = () => {
    if (keycloak?.accountManagement) keycloak.accountManagement();
  };

  const logout = async () => {
    if (developmentMode) {
      try { await apiService.auth.logout(); } catch (error) { console.error('Logout error:', error); }
      setUser(null);
      setIsAuthenticated(false);
      setToken(null);
    } else if (keycloak) {
      keycloak.logout({ redirectUri: window.location.origin });
    }
  };

  const hasRole = role => user?.roles?.includes(role) || false;
  const hasAnyRole = roles => roles.some(role => hasRole(role));
  const getAuthHeaders = () => authMode !== 'local' && token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  const value = {
    isAuthenticated, user, loading, token, keycloak, developmentMode,
    login, verifyMfa, changePassword, setupMfa, enableMfa, disableMfa,
    openAccountManagement, logout, hasRole, hasAnyRole, getAuthHeaders
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
