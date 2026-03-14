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
- **Database**: sunrise_school_db
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
# Create database and user (if not exists)
psql -U postgres
CREATE DATABASE sunrise_school_db;
CREATE USER sunrise_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE sunrise_school_db TO sunrise_user;

# Run schema scripts
psql -U sunrise_user -d sunrise_school_db -f database-scripts/schema/001_initial_schema.sql
```

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

