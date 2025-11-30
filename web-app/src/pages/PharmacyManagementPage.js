import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Badge
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import WarningIcon from '@mui/icons-material/Warning';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import InventoryIcon from '@mui/icons-material/Inventory';
import ReceiptIcon from '@mui/icons-material/Receipt';
import RefreshIcon from '@mui/icons-material/Refresh';

const PharmacyManagementPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [drugs, setDrugs] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [reorderAlerts, setReorderAlerts] = useState([]);

  useEffect(() => {
    fetchStatistics();
    fetchReorderAlerts();
  }, []);

  useEffect(() => {
    if (activeTab === 0) {
      fetchDrugs();
    } else if (activeTab === 1) {
      fetchPrescriptions();
    }
  }, [activeTab, searchTerm]);

  const fetchStatistics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/pharmacy/statistics', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchDrugs = async () => {
    setLoading(true);
    try {
      const url = searchTerm
        ? `http://localhost:3001/api/pharmacy/drugs?search=${searchTerm}`
        : 'http://localhost:3001/api/pharmacy/drugs';

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDrugs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching drugs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/pharmacy/prescriptions/queue/pending', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPrescriptions(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReorderAlerts = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/pharmacy/drugs/alerts/reorder', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setReorderAlerts(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching reorder alerts:', error);
    }
  };

  const getStockStatusColor = (stock, reorderLevel) => {
    if (stock === 0) return 'error';
    if (stock <= reorderLevel) return 'warning';
    return 'success';
  };

  const getStockStatusLabel = (stock, reorderLevel) => {
    if (stock === 0) return 'Out of Stock';
    if (stock <= reorderLevel) return 'Low Stock';
    return 'In Stock';
  };

  return (
    <Container sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LocalPharmacyIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            💊 Pharmacy Management
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => {
            fetchStatistics();
            fetchReorderAlerts();
            if (activeTab === 0) fetchDrugs();
            else if (activeTab === 1) fetchPrescriptions();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Reorder Alerts */}
      {reorderAlerts.length > 0 && (
        <Alert
          severity="warning"
          icon={<WarningIcon />}
          sx={{ mb: 3 }}
        >
          <strong>{reorderAlerts.length} drug(s) need reordering:</strong>{' '}
          {reorderAlerts.slice(0, 3).map(d => d.generic_name).join(', ')}
          {reorderAlerts.length > 3 && ` and ${reorderAlerts.length - 3} more`}
        </Alert>
      )}

      {/* Statistics Cards */}
      {statistics && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Pending Prescriptions
                </Typography>
                <Typography variant="h3" component="div" color="warning.main">
                  {statistics.pending_prescriptions || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Partial Prescriptions
                </Typography>
                <Typography variant="h3" component="div" color="info.main">
                  {statistics.partial_prescriptions || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Dispensed Today
                </Typography>
                <Typography variant="h3" component="div" color="success.main">
                  {statistics.dispensed_today || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Sales Today
                </Typography>
                <Typography variant="h3" component="div" color="primary.main">
                  KSh {parseFloat(statistics.sales_today || 0).toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab
            icon={<InventoryIcon />}
            label="Drug Inventory"
            iconPosition="start"
          />
          <Tab
            icon={
              <Badge badgeContent={statistics?.pending_prescriptions || 0} color="warning">
                <ReceiptIcon />
              </Badge>
            }
            label="Prescriptions Queue"
            iconPosition="start"
          />
          <Tab
            icon={<WarningIcon />}
            label={`Reorder Alerts (${reorderAlerts.length})`}
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Search Bar */}
      {activeTab < 2 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <TextField
            fullWidth
            placeholder={activeTab === 0 ? "Search drugs by name, code..." : "Search prescriptions..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Paper>
      )}

      {/* Tab Content */}
      {activeTab === 0 && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Drug Inventory ({drugs.length} items)</Typography>
            <Button startIcon={<AddIcon />} variant="contained">
              Add New Drug
            </Button>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Code</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Drug Name</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Category</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Strength</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Stock</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Unit Price</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Selling Price</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {drugs.map((drug) => (
                  <TableRow key={drug.id} sx={{
                    backgroundColor: drug.current_stock === 0 ? 'error.light' :
                      drug.needs_reorder ? 'warning.light' : 'inherit'
                  }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {drug.drug_code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1" fontWeight="medium">
                        {drug.generic_name}
                      </Typography>
                      {drug.brand_name && (
                        <Typography variant="caption" color="text.secondary">
                          ({drug.brand_name})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={drug.category_name || 'N/A'} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {drug.strength} {drug.dosage_form}
                    </TableCell>
                    <TableCell>
                      <Typography
                        fontWeight="bold"
                        color={
                          drug.current_stock === 0 ? 'error.main' :
                            drug.needs_reorder ? 'warning.main' : 'success.main'
                        }
                      >
                        {drug.current_stock} {drug.unit_of_measure}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Reorder: {drug.reorder_level}
                      </Typography>
                    </TableCell>
                    <TableCell>KSh {parseFloat(drug.unit_price).toFixed(2)}</TableCell>
                    <TableCell>
                      <Typography fontWeight="bold">
                        KSh {parseFloat(drug.selling_price).toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getStockStatusLabel(drug.current_stock, drug.reorder_level)}
                        color={getStockStatusColor(drug.current_stock, drug.reorder_level)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" variant="outlined">
                          Edit
                        </Button>
                        <Button size="small" variant="contained" color="primary">
                          Stock In
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {activeTab === 1 && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">
              Pharmacy Queue ({prescriptions.length} pending)
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Rx Number</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UHID</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Items</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Wait Time</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Total Amount</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {prescriptions.map((rx) => (
                  <TableRow key={rx.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {rx.prescription_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1">
                        {rx.patient_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={rx.uhid} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${rx.pending_items} pending`}
                        color="warning"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        color={
                          rx.waiting_minutes > 30 ? 'error.main' :
                            rx.waiting_minutes > 15 ? 'warning.main' : 'text.primary'
                        }
                        fontWeight="bold"
                      >
                        {Math.round(rx.waiting_minutes)} min
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="bold">
                        KSh {parseFloat(rx.total_amount || 0).toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={rx.status}
                        color={rx.status === 'pending' ? 'warning' : 'info'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" variant="outlined">
                          View
                        </Button>
                        <Button size="small" variant="contained" color="success">
                          Dispense
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {activeTab === 2 && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">
              ⚠️ Drugs Needing Reorder ({reorderAlerts.length})
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'warning.main' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Drug Code</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Drug Name</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Current Stock</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Reorder Level</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Suggested Order</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reorderAlerts.map((drug) => (
                  <TableRow key={drug.id} sx={{ backgroundColor: drug.current_stock === 0 ? 'error.light' : 'inherit' }}>
                    <TableCell>{drug.drug_code}</TableCell>
                    <TableCell>
                      <Typography variant="body1" fontWeight="medium">
                        {drug.generic_name}
                      </Typography>
                      {drug.brand_name && (
                        <Typography variant="caption" color="text.secondary">
                          ({drug.brand_name})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={drug.category_name} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography color="error.main" fontWeight="bold">
                        {drug.current_stock} {drug.unit_of_measure}
                      </Typography>
                    </TableCell>
                    <TableCell>{drug.reorder_level}</TableCell>
                    <TableCell>
                      <Typography fontWeight="bold" color="success.main">
                        {drug.reorder_level * 3} {drug.unit_of_measure}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        (~3 months supply)
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="contained" color="primary">
                        Create PO
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Container>
  );
};

export default PharmacyManagementPage;

