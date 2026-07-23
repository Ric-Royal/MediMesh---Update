import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Button,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  Lock as LockIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Description as DocIcon,
  TableChart as SpreadsheetIcon,
  Code as CodeIcon,
  Info as InfoIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  LocalHospital as MedicalIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const FilePreview = ({
  recordId = null,
  patientId = null,
  category = 'medical-records',
  onDownload = () => {},
  onDelete = () => {},
  onShare = () => {},
  showDetails = true,
  showActions = true,
  allowDelete = true,
  allowShare = false
}) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const { hasRole } = useAuth();

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/files?recordId=${recordId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('medimesh_token') || localStorage.getItem('token') || localStorage.getItem('dev_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setFiles(data.data || []);
      } else {
        setError('Failed to load files');
      }
    } catch (err) {
      setError('Failed to load files');
      console.error('File fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  // Fetch files when component mounts or recordId changes
  useEffect(() => {
    if (recordId) {
      fetchFiles();
    }
  }, [recordId, fetchFiles]);

  const getFileIcon = (file) => {
    const mimeType = file.mimeType || file.mime_type || '';
    const size = 40;
    const props = { sx: { width: size, height: size } };

    if (mimeType.startsWith('image/')) {
      return <ImageIcon color="primary" {...props} />;
    } else if (mimeType.includes('pdf')) {
      return <DocIcon color="error" {...props} />;
    } else if (mimeType.includes('document') || mimeType.includes('word')) {
      return <DocIcon color="info" {...props} />;
    } else if (mimeType.includes('sheet') || mimeType.includes('excel')) {
      return <SpreadsheetIcon color="success" {...props} />;
    } else if (mimeType.includes('text/')) {
      return <CodeIcon color="default" {...props} />;
    } else if (mimeType.includes('dicom')) {
      return <MedicalIcon color="secondary" {...props} />;
    } else {
      return <FileIcon color="default" {...props} />;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeLabel = (mimeType) => {
    const typeMap = {
      'image/jpeg': 'JPEG Image',
      'image/png': 'PNG Image',
      'image/gif': 'GIF Image',
      'application/pdf': 'PDF Document',
      'application/msword': 'Word Document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
      'application/vnd.ms-excel': 'Excel Spreadsheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
      'text/plain': 'Text File',
      'text/csv': 'CSV File',
      'application/dicom': 'DICOM Medical Image'
    };
    return typeMap[mimeType] || 'Unknown File';
  };

  const getCategoryLabel = (category) => {
    const categoryMap = {
      'medical-records': 'Medical Records',
      'patient-documents': 'Patient Documents',
      'system-files': 'System Files'
    };
    return categoryMap[category] || category;
  };

  const handleDownload = async (file) => {
    try {
      // This would typically make an API call to get a download URL
      // For now, we'll just call the onDownload callback
      onDownload(file);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleView = (file) => {
    setSelectedFile(file);
    setDetailsOpen(true);
  };

  const handleDeleteClick = (file) => {
    setFileToDelete(file);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (fileToDelete) {
      onDelete(fileToDelete);
      setDeleteConfirmOpen(false);
      setFileToDelete(null);
    }
  };

  const handleShare = (file) => {
    onShare(file);
  };

  const renderFileCard = (file) => (
    <Card key={file.id} sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flexShrink: 0 }}>
            {getFileIcon(file)}
          </Box>
          
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 'medium' }}>
                {file.originalName || file.original_name || file.name}
              </Typography>
              {file.isPrivate && (
                <Tooltip title="Private file - restricted access">
                  <LockIcon fontSize="small" color="warning" />
                </Tooltip>
              )}
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Chip
                label={getFileTypeLabel(file.mimeType || file.mime_type)}
                size="small"
                variant="outlined"
                color="primary"
              />
              <Typography variant="body2" color="text.secondary">
                {formatFileSize(file.size || file.file_size)}
              </Typography>
              <Chip
                label={getCategoryLabel(file.category)}
                size="small"
                variant="outlined"
                color="secondary"
              />
            </Box>
            
            {file.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {file.description}
              </Typography>
            )}
            
            {file.tags && file.tags.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                {file.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
              </Box>
            )}
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                <CalendarIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                {format(new Date(file.uploadedAt || file.created_at), 'MMM dd, yyyy')}
              </Typography>
              {file.uploadedBy && (
                <Typography variant="caption" color="text.secondary">
                  <PersonIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                  {file.uploadedBy}
                </Typography>
              )}
            </Box>
          </Box>
          
          {showActions && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Tooltip title="View details">
                <IconButton size="small" onClick={() => handleView(file)}>
                  <ViewIcon />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Download">
                <IconButton size="small" onClick={() => handleDownload(file)}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              
              {allowShare && (
                <Tooltip title="Share">
                  <IconButton size="small" onClick={() => handleShare(file)}>
                    <ShareIcon />
                  </IconButton>
                </Tooltip>
              )}
              
              {allowDelete && (hasRole('admin') || hasRole('doctor')) && (
                <Tooltip title="Delete">
                  <IconButton 
                    size="small" 
                    color="error" 
                    onClick={() => handleDeleteClick(file)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );

  const renderFileList = () => (
    <List>
      {files.map((file) => (
        <ListItem key={file.id} divider>
          <ListItemAvatar>
            <Avatar sx={{ bgcolor: 'transparent' }}>
              {getFileIcon(file)}
            </Avatar>
          </ListItemAvatar>
          
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1" noWrap>
                  {file.originalName || file.original_name || file.name}
                </Typography>
                {file.isPrivate && <LockIcon fontSize="small" color="warning" />}
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(file.size || file.file_size)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {format(new Date(file.uploadedAt || file.created_at), 'MMM dd, yyyy')}
                </Typography>
              </Box>
            }
          />
          
          {showActions && (
            <ListItemSecondaryAction>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton size="small" onClick={() => handleView(file)}>
                  <ViewIcon />
                </IconButton>
                <IconButton size="small" onClick={() => handleDownload(file)}>
                  <DownloadIcon />
                </IconButton>
                {allowDelete && (hasRole('admin') || hasRole('doctor')) && (
                  <IconButton 
                    size="small" 
                    color="error" 
                    onClick={() => handleDeleteClick(file)}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            </ListItemSecondaryAction>
          )}
        </ListItem>
      ))}
    </List>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!files || files.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', p: 4 }}>
        <FileIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No files found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No files have been uploaded yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Files ({files.length})
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {getCategoryLabel(category)} attachments
        </Typography>
      </Box>

      {/* File Display */}
      {showDetails ? (
        <Box>
          {files.map((file) => renderFileCard(file))}
        </Box>
      ) : (
        renderFileList()
      )}

      {/* File Details Dialog */}
      <Dialog 
        open={detailsOpen} 
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon />
            File Details
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedFile && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  {getFileIcon(selectedFile)}
                  <Box>
                    <Typography variant="h6">
                      {selectedFile.originalName || selectedFile.original_name || selectedFile.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {getFileTypeLabel(selectedFile.mimeType || selectedFile.mime_type)}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Size: {formatFileSize(selectedFile.size || selectedFile.file_size)}
                  </Typography>
                  {selectedFile.isPrivate && (
                    <Chip
                      icon={<LockIcon />}
                      label="Private"
                      size="small"
                      color="warning"
                    />
                  )}
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                <Divider />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Upload Information
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Uploaded: {format(new Date(selectedFile.uploadedAt || selectedFile.created_at), 'PPP')}
                </Typography>
                {selectedFile.uploadedBy && (
                  <Typography variant="body2" color="text.secondary">
                    By: {selectedFile.uploadedBy}
                  </Typography>
                )}
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Category
                </Typography>
                <Chip
                  label={getCategoryLabel(selectedFile.category)}
                  color="secondary"
                  variant="outlined"
                />
              </Grid>
              
              {selectedFile.description && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {selectedFile.description}
                  </Typography>
                </Grid>
              )}
              
              {selectedFile.tags && selectedFile.tags.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    Tags
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selectedFile.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" />
                    ))}
                  </Box>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>
            Close
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => {
              handleDownload(selectedFile);
              setDetailsOpen(false);
            }}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteConfirmOpen} 
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this file? This action cannot be undone.
          </Typography>
          {fileToDelete && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight="medium">
                {fileToDelete.originalName || fileToDelete.original_name || fileToDelete.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatFileSize(fileToDelete.size || fileToDelete.file_size)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            startIcon={<DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FilePreview;
