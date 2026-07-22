import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Container,
  Stack,
  Divider,
  TextField,
  Alert
} from '@mui/material';
import {
  LocalHospital as HospitalIcon,
  Security as SecurityIcon,
  HealthAndSafety as HealthIcon,
  Shield as ShieldIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = () => {
  const { login, verifyMfa } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (mfaToken) {
      if (!/^\d{6}$/.test(mfaCode)) {
        setError('Enter the six-digit code from your authenticator app');
        return;
      }
      setLoading(true);
      setError(null);
      const result = await verifyMfa(mfaToken, mfaCode);
      if (!result.success) setError(result.error || 'Authenticator code was not accepted');
      setLoading(false);
      return;
    }
    if (!formData.username.trim() || !formData.password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await login(formData.username, formData.password);
      if (!result.success) {
        setError(result.error || 'Login failed. Please try again.');
      } else if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMfaCode('');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: <SecurityIcon color="primary" />,
      title: 'One patient journey',
      description: 'Registration, care, orders and payment stay connected'
    },
    {
      icon: <HealthIcon color="primary" />,
      title: 'Role-ready workspaces',
      description: 'Focused queues for every clinical service'
    },
    {
      icon: <ShieldIcon color="primary" />,
      title: 'Safe hand-offs',
      description: 'Visible priorities, ownership and next steps'
    }
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 15% 20%, #D7EEF0 0, transparent 34%), #F1F5F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2
      }}
    >
      <Container maxWidth="lg">
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            minHeight: 560,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 24px 70px rgba(15, 23, 42, 0.12)'
          }}
        >
          {/* Left side - Branding */}
          <Box
            sx={{
              flex: 1,
              background: 'linear-gradient(145deg, #0F3B4D 0%, #176B72 100%)',
              color: 'white',
              p: 4,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center'
            }}
          >
            <HospitalIcon sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h3" component="h1" gutterBottom fontWeight={800}>
              MediMesh
            </Typography>
            <Typography variant="h5" sx={{ mb: 1, color: 'white' }}>
              Clinical operations, connected.
            </Typography>
            <Typography variant="body1" sx={{ mb: 4, opacity: 0.78, maxWidth: 360 }}>
              A calmer, safer workspace for the people moving patients through care.
            </Typography>
            
            <Stack spacing={3} sx={{ width: '100%', maxWidth: 300 }}>
              {features.map((feature, index) => (
                <Box key={index} sx={{ textAlign: 'left' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {feature.icon}
                    <Typography variant="subtitle1" fontWeight="medium">
                      {feature.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ opacity: 0.8, ml: 4 }}>
                    {feature.description}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Right side - Login */}
          <Box
            sx={{
              flex: 1,
              p: 4,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <Typography variant="h3" component="h2" gutterBottom>
              Start your shift
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              {mfaToken
                ? 'Confirm this sign-in with the six-digit code from your authenticator app.'
                : 'Sign in to open your clinical workspace and live patient queues.'}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleLogin}>
              <Stack spacing={3}>
                {!mfaToken && <TextField
                  fullWidth
                  label="Username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                    }
                  }}
                />}

                {!mfaToken && <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                    }
                  }}
                />}

                {mfaToken && <TextField
                  fullWidth
                  label="Authenticator code"
                  value={mfaCode}
                  onChange={(e) => {
                    setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError(null);
                  }}
                  disabled={loading}
                  autoComplete="one-time-code"
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }}
                  autoFocus
                  required
                />}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 'medium'
                  }}
                  fullWidth
                >
                  {loading ? 'Verifying…' : mfaToken ? 'Verify and sign in' : 'Sign In'}
                </Button>

                {mfaToken && <Button
                  type="button"
                  onClick={() => { setMfaToken(null); setMfaCode(''); setError(null); }}
                  disabled={loading}
                >
                  Use a different account
                </Button>}

                {process.env.REACT_APP_SHOW_DEMO_LOGIN === 'true' && !mfaToken && (
                  <>
                    <Divider>
                      <Typography variant="body2" color="text.secondary">
                        Development Mode
                      </Typography>
                    </Divider>
                    <Typography variant="caption" color="text.secondary" align="center">
                      Demo access: <strong>admin</strong> / <strong>admin123</strong>
                    </Typography>
                  </>
                )}
              </Stack>
            </form>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {process.env.REACT_APP_SHOW_DEMO_LOGIN === 'true'
                  ? 'Development environment — do not use real patient data'
                  : 'Protected account authentication with MFA support'
                }
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
            © 2026 MediMesh · Clinical operations platform
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default LoginPage;
