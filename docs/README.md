# 📚 MediMesh Documentation Center

> **Current release documentation (22 July 2026):** Use the
> [role-based user guide](USER-GUIDE.md),
> [production operations guide](PRODUCTION-OPERATIONS.md), and
> [regulatory/release gates](REGULATORY-AND-RELEASE-GATES.md). Other documents
> in this directory are historical engineering snapshots. They may contain
> development-only passwords, ports, `latest` image examples, or superseded
> architecture and must not be used to operate a production deployment.

**Historical index last updated:** November 30, 2025

This directory contains all project documentation, organized by category for easy navigation.

---

## 📁 **Directory Structure**

```
docs/
├── architecture/           # System design & technical architecture
├── project-reports/        # Status reports & assessments
├── mpesa-integration/      # Payment system documentation (if exists)
├── deployment/            # Deployment guides & infrastructure
├── settings-system/       # Settings feature documentation
└── visualizations/        # System diagrams & flowcharts
```

---

## 🗂️ **Documentation Categories**

### 1. **Architecture** (`docs/architecture/`)
**Purpose:** Technical system design and architecture documentation

**Key Documents:**
- System design specifications
- Database schemas
- API architecture
- Security architecture
- Component hierarchies

**Audience:** Developers, Technical Leads, Architects

---

### 2. **Project Reports** (`docs/project-reports/`)
**Purpose:** Project status, progress reports, and assessments

**Key Documents:**
- ✅ **`MISSING_FEATURES_SUMMARY.md`** - Quick reference for missing hospital operations
- ✅ **`HOSPITAL_OPERATIONS_GAP_ANALYSIS.md`** - Detailed analysis of missing modules
- Progress reports (dated)
- Status assessments
- Recovery plans
- Strategic improvement plans

**Audience:** Project Managers, Stakeholders, Business Analysts

**Latest Reports:**
- `MISSING_FEATURES_SUMMARY.md` - Quick guide to what's missing for hospital operations
- `HOSPITAL_OPERATIONS_GAP_ANALYSIS.md` - Comprehensive gap analysis with implementation roadmap
- `PROGRESS_REPORT_01-08-2025.md` - System status as of August 1, 2025

---

### 3. **M-Pesa Integration** (`docs/mpesa-integration/`)
**Purpose:** Payment system integration documentation

**Key Documents:**
- Integration guides
- API reference
- Setup instructions
- Troubleshooting guides
- Credentials management

**Audience:** Developers, DevOps, Finance Team

**Status:** M-Pesa integration completed November 30, 2025

---

### 4. **Deployment** (`docs/deployment/`)
**Purpose:** Deployment procedures and infrastructure guides

**Key Documents:**
- Deployment logs
- Infrastructure setup
- Configuration guides
- Environment setup
- Production checklists

**Audience:** DevOps, System Administrators, Deployment Engineers

---

### 5. **Settings System** (`docs/settings-system/`)
**Purpose:** Settings feature documentation

**Key Documents:**
- Settings specification
- Integration guides
- API documentation
- Resolution reports

**Audience:** Developers, Product Managers

---

### 6. **Visualizations** (`docs/visualizations/`)
**Purpose:** System diagrams, flowcharts, and visual documentation

**Key Documents:**
- System architecture diagrams
- Frontend routing structure
- Backend API routing
- Component hierarchies
- Data flow diagrams
- Settings system integration

**Audience:** All stakeholders (visual learners)

---

## 🎯 **Quick Access - Common Questions**

### **"What features are missing in MediMesh?"**
📖 Read: `docs/project-reports/MISSING_FEATURES_SUMMARY.md`

### **"I need a detailed gap analysis for hospital operations"**
📖 Read: `docs/project-reports/HOSPITAL_OPERATIONS_GAP_ANALYSIS.md`

### **"What's the current project status?"**
📖 Read: Latest `PROGRESS_REPORT_*.md` in `docs/project-reports/`

### **"How do I set up M-Pesa payments?"**
📖 Read: M-Pesa documentation in `docs/mpesa-integration/` (if exists)

### **"What's the system architecture?"**
📖 Read: `docs/architecture/SYSTEM_DESIGN_ARCHITECTURE_02-08-2025.md`
📖 View: Diagrams in `docs/visualizations/`

### **"How do I deploy to production?"**
📖 Read: `docs/deployment/DEPLOYMENT_STATUS_REPORT.md`

---

## 📊 **Document Types Explained**

### **Progress Reports** 📈
- Named: `PROGRESS_REPORT_DD-MM-YYYY.md`
- Purpose: Track what was completed, what's in progress
- Frequency: After major milestones

### **Status Reports** 📋
- Named: `*_STATUS.md` or `*_STATUS_REPORT.md`
- Purpose: Current state of specific features/modules
- Updated: As needed

### **Assessment Documents** 🔍
- Named: `*_ASSESSMENT_DD-MM-YYYY.md`
- Purpose: Evaluate specific aspects (functionality, architecture, etc.)
- Updated: During review cycles

### **Recovery/Resolution Plans** 🛠️
- Named: `*_RECOVERY_PLAN_*.md` or `*_RESOLUTION_*.md`
- Purpose: Document issue resolution or system recovery efforts
- Created: When issues arise

### **Guides & Specifications** 📚
- Named: `*_GUIDE.md`, `*_SPECIFICATION.md`, `*_DOCUMENTATION.md`
- Purpose: How-to guides and detailed specs
- Updated: As features evolve

---

## 🎓 **For New Team Members**

### **Start Here:**
1. ✅ Read: Main `README.md` (root directory) - System overview
2. ✅ Read: `docs/project-reports/MISSING_FEATURES_SUMMARY.md` - What we have vs. what's missing
3. ✅ Review: `docs/visualizations/01-system-architecture-overview.md` - Visual system map
4. ✅ Check: Latest `PROGRESS_REPORT_*.md` - Current status

### **Then:**
5. Explore architecture docs for technical deep-dive
6. Review relevant integration guides (M-Pesa, etc.)
7. Check deployment docs if setting up infrastructure

---

## 🔄 **Document Maintenance**

### **When to Update Docs:**
- ✅ After completing a major feature
- ✅ After architectural changes
- ✅ After deployment to production
- ✅ When resolving major issues
- ✅ Monthly progress updates

### **Naming Conventions:**
- Use UPPERCASE for document titles
- Use hyphens (-) for spaces
- Include dates when relevant: `DD-MM-YYYY`
- Use descriptive names: `FEATURE_NAME_DOCUMENT_TYPE.md`

**Examples:**
- `PROGRESS_REPORT_30-11-2025.md` ✅
- `MPESA_INTEGRATION_GUIDE.md` ✅
- `SYSTEM_DESIGN_ARCHITECTURE_02-08-2025.md` ✅

---

## 📝 **Document Templates**

### **Progress Report Template:**
```markdown
# Progress Report - [Date]

## Summary
[Brief overview of work completed]

## Completed Features
- Feature 1
- Feature 2

## In Progress
- Task 1 (50%)

## Next Steps
- Planned work

## Blockers
- Any issues
```

### **Gap Analysis Template:**
```markdown
# [Feature] Gap Analysis

## Current State
[What exists now]

## Missing Features
[What's needed]

## Implementation Plan
[How to build it]

## Effort Estimate
[Time/resources needed]
```

---

## 🚨 **Important Notes**

### **Root Directory Cleanup:**
- 📂 All MD files have been/should be moved to `docs/` subfolders
- 📂 Only `readme.md`, `SECURITY.md`, and essential project files remain in root
- 📂 This improves repository organization and navigation

### **Archive Folder:**
- 📦 Location: `archive/` (root level)
- 📦 Contains: Older documents no longer actively used
- 📦 Do NOT delete: Historical reference is valuable

---

## 🔗 **Related Resources**

### **External Documentation:**
- Daraja API Docs: https://developer.safaricom.co.ke/
- Keycloak Docs: https://www.keycloak.org/documentation
- Docker Docs: https://docs.docker.com/

### **Internal Code Documentation:**
- API Routes: `services/patient-api/src/routes/`
- Database Models: `services/patient-api/src/models/`
- Frontend Components: `web-app/src/components/`

---

## 💡 **Tips for Using This Documentation**

1. **Start broad, go deep:** Begin with summaries, then dive into detailed docs
2. **Check dates:** Newer documents supersede older ones
3. **Use search:** GitHub's file search is your friend (press `/` in repo)
4. **Follow links:** Documents reference each other - follow the trail
5. **Ask questions:** If docs are unclear, request updates

---

## 📞 **Need Help?**

- 📧 For technical questions: Check architecture docs first
- 📧 For project status: Check latest progress reports
- 📧 For deployment: Check deployment guides
- 📧 For gaps/missing features: Check gap analysis docs

---

## 🎯 **Documentation Principles**

1. **Up-to-date:** Keep docs current with code
2. **Accessible:** Write for all skill levels
3. **Organized:** Use consistent structure
4. **Searchable:** Use descriptive titles and keywords
5. **Actionable:** Provide next steps, not just descriptions

---

**Last Reviewed:** November 30, 2025  
**Maintained By:** Development Team  
**Status:** Active and maintained

---

**🌟 Remember:** Good documentation is as important as good code! 🌟

