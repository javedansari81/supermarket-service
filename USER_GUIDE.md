# SuperMart User Guide

A practical guide to the Supermarket Management System: login, roles, and how to use every screen.

The application is a multi-tenant POS and back-office system for product procurement, inventory, barcode labels, billing, invoices, and reports.

- **Web app:** `http://localhost:3000` (sidebar brand: **SuperMart**)
- **API:** `http://localhost:8000/api/v1`
- **Default admin (seed data):** username `admin`, password `admin123`

For install and database setup, see [README.md](README.md).

---

## 1. Sign in and navigation

### Login

1. Open the web app. You are taken to **Supermarket POS — Sign in to your account**.
2. Enter **Username** and **Password**.
3. Click the eye icon to show or hide the password.
4. Click **Sign In**.

On success you land on **Dashboard**. Invalid credentials show an error. Your session is stored in the browser until you log out.

### Screen layout

| Area | What it does |
|------|----------------|
| Left sidebar | Menu. Shows your store name (tenant) under **SuperMart**. |
| Top bar | Signed-in name, role (**Administrator** or **Cashier**), and avatar menu. |
| Avatar menu | **Logout** — ends the session and returns to login. |

Cashiers only see **Dashboard**, **Billing / POS**, and **Invoices**. Admins see the full menu.

---

## 2. User roles

| | Admin | Cashier |
|---|--------|---------|
| Dashboard (sales today / month) | Yes (store-wide) | Yes (own bills only) |
| Margin, stock value, reorder, expiry, cashier panels | Yes | No |
| Billing / POS | Yes | Yes |
| Products, categories, suppliers | Yes | No |
| Purchases, inventory, barcodes | Yes | No |
| Invoices (view / print) | Yes | Yes |
| Reports, users, audit logs, settings | Yes | No |

---

## 3. Dashboard

Home screen after login. Greeting uses your full name (or username). Admins see store-wide figures (**Store-wide** chip); cashiers see only the bills they created (**My sales** chip). Click the refresh icon to reload.

**Everyone sees**

- **Today's Sales** — with % change vs the same time last week, and yesterday's sales up to the same time
- **Bills Today** — bill count and average items per bill
- **Average Bill Value** — plus discounts given today (₹ and %)
- **Month-to-Date Sales** — with % change vs last month up to the same point
- **Cancelled / Refunded** — count and amount today
- **Sales by Hour** — today's hourly bars (current hour highlighted)
- **Payment Mix** — Cash / UPI / Card share today
- **Last 7 Days** — daily sales trend
- **Customers Today** — identified, repeat and new customers, and share of bills with a mobile number
- **Top Products Today** — top 5 by revenue

**Admins also see**

- **Gross Margin Today (est.)** — net sales minus cost, using each product's current purchase price
- **Stock Value (at cost)** — plus active product and category counts
- **Stock Alerts** — out-of-stock and low-stock counts
- **Cashier Performance Today** — bills, sales and average bill per cashier
- **Reorder Needed** — items at or below reorder level, with a shortcut to Purchases
- **Expiry Watch** — expired and soon-to-expire items (7 / 30 days) that are still in stock

Use this page at opening and during the day to track sales pace and (as admin) stock and expiry risk.

---

## 4. Billing / POS

Cashier checkout. Open **Billing / POS** from the sidebar. The search box is focused automatically for barcode scanners.

### Add items to the cart

1. Scan a barcode, or type the barcode and press **Enter** / click **Add**.
2. The product is added at selling price and tax from the product record.
3. Scanning the same product again increases quantity by 1.
4. If stock is insufficient, you get **Insufficient stock** and the quantity is not increased.

Unknown barcodes show **Product not found**.

### Change the cart

- **− / +** — decrease or increase quantity (cannot exceed stock)
- **Delete** — remove the line
- Empty cart message: *Scan or search products to add to cart*

The right panel shows **Subtotal**, **Tax**, and **Grand Total**.

### Complete a sale

1. Click **Checkout** (disabled if the cart is empty).
2. Choose **Payment Mode**: Cash, Card, or UPI.
3. Optionally enter **Customer Name** and **Customer Phone**.
4. Confirm the total, then click **Complete & Print**.
5. Success toast shows the sale / invoice number (for example `Sale completed! Invoice: …`).
6. The cart clears and focus returns to search for the next customer.

Stock is reduced when the sale is saved. Find the bill later under **Invoices**.

---

## 5. Products (Admin)

Master catalog used by POS, purchases, inventory, and barcodes.

### Browse and search

- Table columns: Product No, Name, Barcode, Category, Price, Stock, Status, Actions
- Search by name or related text; click refresh to reload
- Paginate with 10 / 25 / 50 rows per page
- Status chip: **active** (green) or inactive

### Add a product

1. Click **Add Product**.
2. Enter at least **Product Name**. Optionally enter **Barcode**.
3. Click **Save**.

The form also holds category, MRP, selling price, purchase price, tax %, reorder level, unit type, and status. If those fields are not visible in the dialog, set prices and category after create by editing, or ensure the product dialog is fully filled before save.

### Edit or delete

- Pencil — edit and **Save**
- Trash — confirm **Delete this product?**

**Tips**

- Assign a unique barcode so POS scan works.
- Set **selling price** and **tax percent** before selling.
- **Reorder level** drives Dashboard low-stock and Inventory status chips.
- Products without a barcode can get one on the **Barcode** page.

---

## 6. Categories (Admin)

Groups products (Groceries, Beverages, Dairy, and so on). Sample data is seeded for Warsi Family Mart.

1. Open **Categories**.
2. **Add Category** — name (required), description, status Active / Inactive.
3. Pencil to edit; trash to delete (confirm first).
4. Refresh reloads the list.

Inactive categories stay in history but should not be used for new products. Assign a category on each product so **Reports → Category Sales** is meaningful.

---

## 7. Suppliers (Admin)

Vendor master used when recording purchases.

**Columns:** Code, Name, Contact, Phone, Email, Status, Actions.

### Add or edit

1. **Add Supplier**.
2. Enter **Supplier Name** (required).
3. Optional: contact person, phone, email, address, status.
4. **Save**. A supplier code is assigned.

Search and refresh work like Products. Only **active** suppliers appear in the New Purchase supplier list.

---

## 8. Purchases (Admin)

Goods-in: receiving stock from a supplier increases inventory.

### Record a purchase

1. Click **New Purchase**.
2. Select **Supplier** and **Purchase Date**.
3. For each line: product, quantity, unit price → **Add**.
4. Remove a line with the trash icon. The table shows line totals and a grand total.
5. **Save Purchase**.

You need a supplier and at least one item. Success: **Purchase recorded**. The grid lists Purchase No, Date, Supplier, Amount, and Status (`completed` vs other).

Do this when stock arrives so POS quantity stays accurate.

---

## 9. Inventory (Admin)

Live stock and movement history.

### Stock Overview

- Product No, name, barcode, category, stock, reorder level
- Stock figure turns emphasis when at or below reorder
- Status: **In Stock**, **Low Stock**, or **Out of Stock**
- Search and refresh as on Products

### Adjust stock

Use for damage, shrinkage, found stock, or opening balances (not a supplier receipt — use Purchases for that).

1. Click the pencil on a row.
2. See **Current Stock**.
3. **Add Stock** or **Remove Stock**, quantity, and reason.
4. **Adjust Stock**.

### Stock Movements

Second tab: date, product, type (`in` / `out`), quantity, reference number, notes. Use it to audit how stock changed (sales, purchases, adjustments).

---

## 10. Barcode (Admin)

Generate missing barcodes and print shelf / pack labels.

### Generate a barcode

The right card **Products Without Barcode** lists items missing a code. Click **Generate**. The product then appears in the print product list.

### Print labels

1. Select a product that already has a barcode.
2. Set how many labels, then **Add**. Same product again adds to the label count.
3. Choose **Label Size**: Small 38×25mm, Medium 50×30mm, Large 70×40mm.
4. **Print Labels (n)** opens a print window with generated HTML.

Remove a line with trash before printing. You cannot add a product that has no barcode — generate first.

---

## 11. Invoices

Sales history for Admin and Cashier.

### Find an invoice

- Search by invoice number
- Filter **From** / **To** dates (defaults: start of month → today)
- Refresh to reload
- Columns: Invoice No, Date, Customer, Amount, Actions

### View and print

- Eye — detail dialog: date, customer (or **Walk-in**), payment mode, lines, subtotal, tax, total
- Printer icon (grid or dialog) — print-friendly invoice in a new window

Walk-in sales have no customer name. Use this for reprints and end-of-day checks.

---

## 12. Reports (Admin)

Analytics for a date range (default: start of month → today). Changing dates reloads all widgets.

**Summary cards**

- Total Sales
- Transactions
- Avg Transaction

**Tabs**

| Tab | Columns |
|-----|---------|
| Top Products | Product, qty sold, revenue |
| Category Sales | Category, items sold, total sales |
| Cashier Performance | Cashier name, transactions, total sales |

Use this for purchasing, staffing, and daily/monthly review.

---

## 13. Users (Admin)

Staff accounts. Roles: **admin** or **cashier**.

### Add a user

1. **Add User**.
2. Username, email, full name, password, role, status.
3. **Save**. Username cannot be changed later.

### Maintain users

- Pencil — email, name, role, status
- Lock — **Reset Password** (new password → **Reset**)
- Trash — confirm delete
- Search and refresh as on other lists

Inactive users should not sign in. Give cashiers **cashier**; keep **admin** for owners and managers.

---

## 14. Audit Logs (Admin)

Who did what, and when. Default range: last 7 days.

**Filters:** Action (All, Create, Update, Delete, Login), Entity Type (Product, Category, Sale, User), From / To.

**Columns:** Timestamp, Action (color chip), Entity Type, Entity ID, User ID, IP Address.

Use after unexpected stock, price, or user changes.

---

## 15. Settings (Admin)

### Store Settings

Store name, phone, email, GST number, address. **Save Settings**. These values appear on invoices and identify the tenant.

### Billing Settings

- **Enable Tax Calculation**
- **Default Tax %** (seed default 18)
- **Invoice Prefix** (for example `INV` or `INV-`)
- **Invoice Footer Text** (for example *Thank you for shopping with us!*)

Save after changes. Currency in the UI is **₹**.

---

## 16. Recommended workflows

### First-time setup (Admin)

1. Log in as `admin`.
2. **Settings** — store and billing details.
3. **Users** — create cashier accounts; share passwords securely.
4. **Categories** — confirm or add groups.
5. **Suppliers** — add vendors.
6. **Products** — name, category, prices, tax, reorder level, barcode.
7. **Barcode** — generate missing codes; print labels.
8. **Purchases** or **Inventory → Adjust** — opening stock.
9. **Billing / POS** — test a sale; reprint from **Invoices**.

### Daily store operation

| Who | Tasks |
|-----|--------|
| Cashier | Login → Billing → scan → checkout (cash/card/UPI) → next customer. Reprint from Invoices. Logout at shift end. |
| Admin | Dashboard for sales and stock alerts → receive goods on Purchases → adjust exceptions in Inventory → print labels → Reports and Audit as needed. |

---

## 17. Troubleshooting

| Problem | What to try |
|---------|-------------|
| Login failed | Check username/password. Seed admin is `admin` / `admin123`. User must be **active**. |
| Product not found at POS | Product needs a matching **barcode**. Generate one on Barcode, or type the exact code. |
| Insufficient stock | Receive a purchase or **Add Stock** on Inventory. |
| Checkout disabled | Cart is empty — add at least one item. |
| Cashier cannot open Products | Expected. Only Dashboard, Billing, Invoices. |
| No barcode in print list | Product has no barcode. Use **Generate** first. |
| Invoice print window blank | Allow pop-ups for the site and try Print again. |
| Session lost | Sign in again. Logout clears the stored token. |

---

## 18. Quick menu map

| Menu | Path | Who |
|------|------|-----|
| Dashboard | `/dashboard` | All |
| Billing / POS | `/billing` | All |
| Products | `/products` | Admin |
| Categories | `/categories` | Admin |
| Suppliers | `/suppliers` | Admin |
| Purchases | `/purchases` | Admin |
| Inventory | `/inventory` | Admin |
| Barcode | `/barcode` | Admin |
| Invoices | `/invoices` | All |
| Reports | `/reports` | Admin |
| Users | `/users` | Admin |
| Audit Logs | `/audit` | Admin |
| Settings | `/settings` | Admin |
