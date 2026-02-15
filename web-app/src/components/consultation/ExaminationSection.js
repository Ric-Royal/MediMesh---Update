import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const ExaminationSection = ({ examination, onChange }) => {
  const handleChange = (field, value) => {
    onChange({
      ...examination,
      [field]: value,
    });
  };

  const examinationSections = [
    {
      title: 'General Appearance',
      field: 'generalAppearance',
      placeholder: 'Alert, oriented, well-nourished, no acute distress...',
      icon: '👤',
    },
    {
      title: 'Cardiovascular System',
      field: 'cardiovascular',
      placeholder: 'Heart sounds, rhythm, murmurs, peripheral pulses...',
      icon: '❤️',
    },
    {
      title: 'Respiratory System',
      field: 'respiratory',
      placeholder: 'Breath sounds, chest expansion, percussion, auscultation...',
      icon: '🫁',
    },
    {
      title: 'Abdominal Examination',
      field: 'abdominal',
      placeholder: 'Inspection, palpation, percussion, auscultation, tenderness...',
      icon: '🫃',
    },
    {
      title: 'Neurological Examination',
      field: 'neurological',
      placeholder: 'Consciousness, cranial nerves, motor, sensory, reflexes...',
      icon: '🧠',
    },
    {
      title: 'Musculoskeletal System',
      field: 'musculoskeletal',
      placeholder: 'Joint examination, range of motion, deformities...',
      icon: '🦴',
    },
    {
      title: 'Skin Examination',
      field: 'skin',
      placeholder: 'Rashes, lesions, color, turgor, wounds...',
      icon: '🩹',
    },
    {
      title: 'Other Findings',
      field: 'other',
      placeholder: 'Any additional examination findings...',
      icon: '📋',
    },
  ];

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Physical Examination
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Document your physical examination findings for each system. Click on a section to expand.
      </Typography>

      {examinationSections.map((section, index) => (
        <Accordion key={section.field} defaultExpanded={index === 0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6">{section.icon}</Typography>
              <Typography variant="subtitle1">{section.title}</Typography>
              {examination[section.field] && (
                <Typography 
                  variant="caption" 
                  sx={{ 
                    ml: 'auto', 
                    bgcolor: 'success.light', 
                    px: 1, 
                    py: 0.5, 
                    borderRadius: 1 
                  }}
                >
                  ✓ Documented
                </Typography>
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={examination[section.field]}
              onChange={(e) => handleChange(section.field, e.target.value)}
              placeholder={section.placeholder}
              variant="outlined"
            />
          </AccordionDetails>
        </Accordion>
      ))}

      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          💡 <strong>Tip:</strong> Document all relevant findings. Normal findings should also be documented (e.g., "No abnormalities detected").
        </Typography>
      </Box>
    </Box>
  );
};

export default ExaminationSection;

