import React, { useState, useMemo, useEffect } from 'react';
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
  IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { debounce } from '@mui/material/utils';
import API_CONFIG from '../../config/api';

export const GlobalSearchBar = ({
  onPatientSelect,
  placeholder = "Search by UHID, name or phone (Ctrl+K)",
  compact = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchFilter, setSearchFilter] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'uhid', label: 'UHID' },
    { value: 'phone', label: 'Phone' },
    { value: 'encounter', label: 'Encounter' },
    { value: 'corporate', label: 'Corporate' },
  ];

  // Debounced search function
  const performSearch = useMemo(
    () => debounce(async (searchQuery) => {
      if (!searchQuery || searchQuery.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const params = new URLSearchParams({
          search: searchQuery,
          filter: searchFilter,
          includeArchived: includeArchived ? '1' : '0',
        });
        const response = await fetch(`${API_CONFIG.endpoints.patients}?${params.toString()}`, {
          headers: API_CONFIG.getAuthHeaders()
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
    [searchFilter, includeArchived]
  );

  useEffect(() => () => performSearch.clear(), [performSearch]);

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
        inputProps={{ 'aria-label': 'Search patients by identifier, name or phone' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon color="action" />
            </InputAdornment>
          ),
          endAdornment: query && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear} aria-label="Clear patient search">
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'background.paper',
            height: compact ? 40 : undefined,
          }
        }}
      />

      {!compact && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        {filterOptions.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            size="small"
            variant={option.value === searchFilter ? 'filled' : 'outlined'}
            color={option.value === searchFilter ? 'primary' : 'default'}
            onClick={() => setSearchFilter(option.value)}
            icon={option.value === searchFilter ? <FilterAltIcon fontSize="small" /> : undefined}
          />
        ))}
        <Chip
          label="Include archived"
          size="small"
          variant={includeArchived ? 'filled' : 'outlined'}
          color={includeArchived ? 'secondary' : 'default'}
          onClick={() => setIncludeArchived((prev) => !prev)}
        />
      </Box>}

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
                            {(patient.phone_number || patient.phone) && (
                              <Typography variant="caption" display="block">
                                {patient.phone_number || patient.phone}
                              </Typography>
                            )}
                            {patient.email && (
                              <Typography variant="caption" display="block">
                                {patient.email}
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

