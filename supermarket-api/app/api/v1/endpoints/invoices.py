"""
Invoice management endpoints
"""
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.sale import Sale, SaleItem
from app.models.tenant import Tenant
from app.models.tenant_setting import TenantSetting
from app.models.user import User
from app.schemas.invoice import InvoiceCreate, InvoiceResponse, InvoiceListResponse, InvoicePrintData
from app.api.deps import get_current_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_invoice_no(db: Session, tenant_id: int) -> str:
    """Generate unique invoice number"""
    today = datetime.now().strftime("%Y%m%d")
    last_invoice = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.invoice_no.like(f"INV{today}%")
    ).order_by(Invoice.id.desc()).first()
    
    if last_invoice:
        last_seq = int(last_invoice.invoice_no[-4:])
        return f"INV{today}{last_seq + 1:04d}"
    return f"INV{today}0001"


def get_setting(db: Session, tenant_id: int, key: str, default: str = "") -> str:
    """Get tenant setting value"""
    setting = db.query(TenantSetting).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key == key
    ).first()
    return setting.setting_value if setting else default


@router.get("", response_model=InvoiceListResponse)
async def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List invoices for current tenant
    """
    query = db.query(Invoice).filter(Invoice.tenant_id == context.tenant_id)
    
    if from_date:
        query = query.filter(func.date(Invoice.invoice_date) >= from_date)
    
    if to_date:
        query = query.filter(func.date(Invoice.invoice_date) <= to_date)
    
    if search:
        query = query.filter(
            (Invoice.invoice_no.ilike(f"%{search}%")) |
            (Invoice.customer_name.ilike(f"%{search}%"))
        )
    
    total = query.count()
    items = query.order_by(Invoice.invoice_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return InvoiceListResponse(
        items=[InvoiceResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get invoice by ID
    """
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.tenant_id == context.tenant_id
    ).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return InvoiceResponse.model_validate(invoice)


@router.get("/{invoice_id}/print")
async def get_invoice_print_data(
    invoice_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get invoice data for printing
    """
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.tenant_id == context.tenant_id
    ).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get sale and items
    sale = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.id == invoice.sale_id
    ).first()
    
    # Get tenant info
    tenant = db.query(Tenant).filter(Tenant.id == context.tenant_id).first()
    
    # Get store settings
    store_name = get_setting(db, context.tenant_id, "store_name", tenant.tenant_name if tenant else "Store")
    store_address = get_setting(db, context.tenant_id, "store_address", "")
    store_phone = get_setting(db, context.tenant_id, "store_phone", "")
    store_gstin = get_setting(db, context.tenant_id, "gstin", "")
    footer_text = get_setting(db, context.tenant_id, "invoice_footer", "Thank you for shopping!")
    
    # Get cashier name
    cashier = db.query(User).filter(User.id == sale.created_by).first() if sale else None
    
    # Build print data
    items = []
    if sale:
        for item in sale.items:
            items.append({
                "product_name": item.product_name,
                "barcode": item.barcode,
                "quantity": float(item.quantity),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "discount_amount": float(item.discount_amount or 0),
                "tax_percent": float(item.tax_percent or 0),
                "tax_amount": float(item.tax_amount or 0),
                "line_total": float(item.line_total)
            })
    
    return InvoicePrintData(
        store_name=store_name,
        store_address=store_address,
        store_phone=store_phone,
        store_gstin=store_gstin,
        invoice_no=invoice.invoice_no,
        invoice_date=invoice.invoice_date.isoformat(),
        customer_name=invoice.customer_name,
        customer_phone=invoice.customer_phone,
        cashier_name=cashier.full_name if cashier else "N/A",
        items=items,
        subtotal=float(invoice.subtotal or 0),
        tax_amount=float(invoice.tax_amount or 0),
        discount_amount=float(invoice.discount_amount or 0),
        total_amount=float(invoice.total_amount or 0),
        payment_mode=sale.payment_mode if sale else "cash",
        footer_text=footer_text
    )


@router.post("/from-sale/{sale_id}", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice_from_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(get_current_user)
):
    """
    Create an invoice from a sale
    """
    # Get sale
    sale = db.query(Sale).filter(
        Sale.id == sale_id,
        Sale.tenant_id == context.tenant_id
    ).first()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Check if invoice already exists for this sale
    existing = db.query(Invoice).filter(Invoice.sale_id == sale_id).first()
    if existing:
        return InvoiceResponse.model_validate(existing)
    
    # Generate invoice number
    invoice_no = generate_invoice_no(db, context.tenant_id)
    
    # Create invoice
    invoice = Invoice(
        tenant_id=context.tenant_id,
        sale_id=sale.id,
        invoice_no=invoice_no,
        invoice_date=datetime.utcnow(),
        customer_name=sale.customer_name,
        customer_phone=sale.customer_phone,
        subtotal=sale.subtotal,
        tax_amount=sale.tax_amount,
        discount_amount=sale.discount_amount,
        total_amount=sale.total_amount,
        created_by=context.user_id
    )
    
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    
    return InvoiceResponse.model_validate(invoice)

