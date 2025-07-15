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
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      title: 'HIPAA Compliant',
      description: 'Enterprise-grade security and compliance'
    },
    {
      icon: <HealthIcon color="primary" />,
      title: 'Medical Records',
      description: 'Comprehensive patient data management'
    },
    {
      icon: <ShieldIcon color="primary" />,
      title: 'Secure Access',
      description: 'Role-based authentication and authorization'
    }
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={24}
          sx={{
            borderRadius: 4,
            overflow: 'hidden',
            display: 'flex',
            minHeight: 500
          }}
        >
          {/* Left side - Branding */}
          <Box
            sx={{
              flex: 1,
              background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
              color: 'white',
              p: 4,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center'
            }}
          >
            <HospitalIcon sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
              MediMesh
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
              Medical Data Management System
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
            <Typography variant="h4" component="h2" gutterBottom align="center">
              Welcome Back
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
              Sign in to access your medical data management dashboard
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleLogin}>
              <Stack spacing={3}>
                <TextField
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
                />

                <TextField
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
                />

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
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>

                {process.env.NODE_ENV === 'development' && (
                  <>
                    <Divider>
                      <Typography variant="body2" color="text.secondary">
                        Development Mode
                      </Typography>
                    </Divider>
                    <Typography variant="caption" color="text.secondary" align="center">
                      Use any username/password combination for testing
                    </Typography>
                  </>
                )}
              </Stack>
            </form>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {process.env.NODE_ENV === 'development' 
                  ? 'Development Mode - Any credentials accepted'
                  : 'Secure authentication powered by Keycloak'
                }
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
            © 2024 MediMesh. HIPAA Compliant Medical Data Management.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default LoginPage; 