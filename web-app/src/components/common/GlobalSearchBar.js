import React, { useState, useCallback, useEffect } from 'react';
import {
  TextField,
  InputAdornment,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import { debounce } from '@mui/material/utils';

export const GlobalSearchBar = ({ onPatientSelect, placeholder = "Search by UHID, Name, or Phone (Ctrl+K)" }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Debounced search function
  const performSearch = useCallback(
    debounce(async (searchQuery) => {
      if (!searchQuery || searchQuery.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(`http://localhost:3001/api/patients?search=${encodeURIComponent(searchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setResults(data.patients || data.data || []);
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    []
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setShowResults(true);
    performSearch(value);
  };

  const handlePatientSelect = (patient) => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    if (onPatientSelect) {
      onPatientSelect(patient);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search-input')?.focus();
      }
      // Escape to close results
      if (e.key === 'Escape') {
        setShowResults(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Box sx={{ position: 'relative', width: '100%', maxWidth: 600 }}>
      <TextField
        id="global-search-input"
        fullWidth
        placeholder={placeholder}
        value={query}
        onChange={handleSearchChange}
        onFocus={() => query && setShowResults(true)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon color="action" />
            </InputAdornment>
          ),
          endAdornment: query && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'background.paper',
          }
        }}
      />

      {/* Search Results Dropdown */}
      {showResults && (query.length >= 2) && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 1,
            maxHeight: 400,
            overflow: 'auto',
            zIndex: 1300
          }}
        >
          {isSearching && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Searching...
              </Typography>
            </Box>
          )}

          {!isSearching && results.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No patients found for "{query}"
              </Typography>
            </Box>
          )}

          {!isSearching && results.length > 0 && (
            <>
              <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {results.length} patient{results.length > 1 ? 's' : ''} found
                </Typography>
              </Box>
              <List>
                {results.map((patient) => (
                  <ListItem key={patient.id} disablePadding>
                    <ListItemButton onClick={() => handlePatientSelect(patient)}>
                      <InputAdornment position="start" sx={{ mr: 2 }}>
                        <PersonIcon color="primary" />
                      </InputAdornment>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1">
                              {patient.first_name} {patient.last_name}
                            </Typography>
                            {patient.uhid && (
                              <Chip 
                                label={patient.uhid} 
                                size="small" 
                                color="primary" 
                                variant="outlined" 
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            {patient.phone_number && (
                              <Typography variant="caption" display="block">
                                📱 {patient.phone_number}
                              </Typography>
                            )}
                            {patient.email && (
                              <Typography variant="caption" display="block">
                                ✉️ {patient.email}
                              </Typography>
                            )}
                            {patient.payment_type && (
                              <Chip 
                                label={patient.payment_type} 
                                size="small" 
                                sx={{ mt: 0.5 }}
                              />
                            )}
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default GlobalSearchBar;

