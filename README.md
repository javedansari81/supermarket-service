# Supermarket Management System

A comprehensive end-to-end supermarket software solution for product procurement, inventory management, barcode generation, billing, and invoice printing.

## Technology Stack

### Backend
- **Language**: Python
- **Framework**: FastAPI
- **Database**: PostgreSQL
- **ORM**: SQLAlchemy
- **Authentication**: JWT-based

### Frontend
- **Framework**: React
- **UI Library**: Material UI
- **State Management**: React Context/Redux

### Database
- **Engine**: PostgreSQL
- **Schema**: mart
- **Database**: warsi_db
- **Port**: 5432

## Project Structure

```
supermarket-management-system/
├── supermarket-api/         # FastAPI backend application
│   ├── app/
│   │   ├── api/            # API endpoints
│   │   ├── core/           # Core configurations
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   └── utils/          # Utility functions
│   ├── requirements.txt
│   └── main.py
├── supermarket-web/        # React frontend application
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── context/       # Context providers
│   │   └── utils/         # Utility functions
│   └── package.json
└── database-scripts/       # Database scripts
    ├── schema/            # Schema creation scripts
    ├── migrations/        # Migration scripts
    ├── seeds/             # Seed data scripts
    └── indexes/           # Index creation scripts
```

## User Guide

Step-by-step instructions for every screen (login, POS, products, inventory, invoices, reports, and more) are in **[USER_GUIDE.md](USER_GUIDE.md)**.

## Features

### Multi-Tenant Architecture
- Tenant-aware from day one
- Shared schema with tenant_id based isolation
- Future-ready for multiple supermarkets

### Core Modules
1. **Authentication & Authorization** - JWT-based with role-based access control
2. **Tenant Management** - Multi-tenant support
3. **User Management** - Admin and Cashier roles
4. **Product Management** - Complete product lifecycle
5. **Category Management** - Product categorization
6. **Supplier Management** - Supplier information
7. **Procurement** - Purchase order management
8. **Inventory Management** - Stock tracking and movements
9. **Barcode Management** - Generation and printing
10. **Billing/Sales** - Fast cashier interface
11. **Invoice Management** - Generation and printing
12. **Reports** - Sales, stock, and purchase reports
13. **Settings** - Tenant-specific configurations
14. **Audit Logs** - Activity tracking

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- PostgreSQL 13+

### Database Setup
```bash
# Create database, user and schema (if not exists)
psql -U postgres
CREATE USER warsi_user WITH PASSWORD 'your_password';
CREATE DATABASE warsi_db OWNER warsi_user;
\c warsi_db
CREATE SCHEMA mart AUTHORIZATION warsi_user;

# Deploy SQL scripts (reads DATABASE_URL / DB_SCHEMA from supermarket-api/.env)
python database-scripts/deploy.py status             # applied / pending scripts
python database-scripts/deploy.py migrate --dry-run  # preview
python database-scripts/deploy.py migrate            # apply pending scripts
```

Applied scripts are recorded in `mart.schema_migrations` and are never run twice.
Scripts run in the order `schema` → `indexes` → `seeds` → `migrations`, sorted by file name.
Do not edit a script after it has been applied; add a new numbered file (e.g. `migrations/002_xxx.sql`) instead.
Scripts must not contain `BEGIN`/`COMMIT`, as each script already runs in its own transaction.

The GitHub Actions workflow `.github/workflows/database-deploy.yml` validates scripts on a fresh
database for every change under `database-scripts/`, and deploys pending scripts on push to `main`
using the `DATABASE_URL` secret of the `production` environment.

### Backend Setup
```bash
cd supermarket-api
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Setup
```bash
cd supermarket-web
npm install
npm start
```

## User Roles

### Admin
- Manage products, categories, suppliers
- Manage stock and procurement
- Generate and print barcodes
- Manage users
- View reports and sales history
- Manage tenant settings

### Seller/Cashier
- Login to billing interface
- Scan barcodes
- Process sales
- Generate and print invoices
- View limited sales history

## License

Proprietary - All rights reserved

