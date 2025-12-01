#!/bin/bash
# Script to fix hardcoded URLs in frontend files

# Files to fix
FILES=(
  "web-app/src/pages/PharmacyManagementPage.js"
  "web-app/src/pages/LabWorkflowPage.js"
  "web-app/src/pages/BillingManagementPage.js"
  "web-app/src/pages/RadiologyWorkflowPage.js"
  "web-app/src/components/common/GlobalSearchBar.js"
  "web-app/src/contexts/AuthContext.js"
)

echo "Fixing hardcoded URLs in frontend files..."

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    
    # Add import if not present
    if ! grep -q "import API_CONFIG from" "$file"; then
      # Find the last import line and add after it
      sed -i "/^import/a import API_CONFIG from '../config/api';" "$file" 2>/dev/null || \
      sed -i '' "/^import/a\\
import API_CONFIG from '../config/api';
" "$file"
    fi
    
    # Replace hardcoded URLs
    sed -i "s|'http://localhost:3001/api/|\`\${API_CONFIG.baseURL}/api/|g" "$file" 2>/dev/null || \
    sed -i '' "s|'http://localhost:3001/api/|\`\${API_CONFIG.baseURL}/api/|g" "$file"
    
    sed -i 's|`http://localhost:3001/api/|`${API_CONFIG.baseURL}/api/|g' "$file" 2>/dev/null || \
    sed -i '' 's|`http://localhost:3001/api/|`${API_CONFIG.baseURL}/api/|g' "$file"
    
    # Replace auth headers
    sed -i "s|{ 'Authorization': \`Bearer \${localStorage.getItem('token') || 'dev-token'}\` }|API_CONFIG.getAuthHeaders()|g" "$file" 2>/dev/null || \
    sed -i '' "s|{ 'Authorization': \`Bearer \${localStorage.getItem('token') || 'dev-token'}\` }|API_CONFIG.getAuthHeaders()|g" "$file"
    
    echo "✓ Fixed $file"
  else
    echo "✗ File not found: $file"
  fi
done

echo "Done!"

