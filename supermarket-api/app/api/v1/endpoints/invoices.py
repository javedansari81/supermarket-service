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
from app.schemas.invoice import (
    InvoiceCreate, InvoiceResponse, InvoiceListResponse, InvoicePrintData, HsnSummaryRow
)
from app.schemas.settings import GST_STATE_CODES, state_code_for
from app.api.v1.endpoints.settings import build_store_settings
from app.api.deps import get_current_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_invoice_no(db: Session, tenant_id: int) -> str:
    """Generate unique invoice number (GST allows at most 16 characters)"""
    prefix = (get_setting(db, tenant_id, "invoice_prefix", "INV") or "INV").strip()[:4]
    today = datetime.now().strftime("%Y%m%d")
    last_invoice = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.invoice_no.like(f"{prefix}{today}%")
    ).order_by(Invoice.id.desc()).first()

    if last_invoice:
        last_seq = int(last_invoice.invoice_no[-4:])
        return f"{prefix}{today}{last_seq + 1:04d}"
    return f"{prefix}{today}0001"


def format_place_of_supply(state_code: str) -> str:
    """Format place of supply as '27-Maharashtra'"""
    name = GST_STATE_CODES.get(state_code, "")
    return f"{state_code}-{name}" if state_code and name else ""


def create_invoice_for_sale(db: Session, sale: Sale, tenant_id: int) -> Invoice:
    """Create the tax invoice for a sale, snapshotting store details as issued"""
    existing = db.query(Invoice).filter(Invoice.sale_id == sale.id).first()
    if existing:
        return existing

    store = build_store_settings(db, tenant_id)
    invoice = Invoice(
        tenant_id=tenant_id,
        sale_id=sale.id,
        invoice_no=generate_invoice_no(db, tenant_id),
        invoice_date=sale.sale_date or datetime.utcnow(),
        store_name=store.store_name,
        store_address=store.store_address,
        store_contact=store.store_phone,
        store_gst=store.gstin,
        store_state=store.store_state or GST_STATE_CODES.get(store.store_state_code or "", ""),
        store_fssai=store.fssai_license,
        customer_name=sale.customer_name,
        customer_phone=sale.customer_phone,
        customer_gstin=sale.customer_gstin,
        place_of_supply=sale.place_of_supply,
        subtotal=sale.subtotal,
        tax_amount=sale.tax_amount,
        cgst_amount=sale.cgst_amount,
        sgst_amount=sale.sgst_amount,
        igst_amount=sale.igst_amount,
        discount_amount=sale.discount_amount,
        total_amount=sale.total_amount,
        payment_mode=sale.payment_mode,
        footer_message=get_setting(db, tenant_id, "invoice_footer", "Thank you for shopping!")
    )
    db.add(invoice)
    db.flush()
    return invoice


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
            (Invoice.customer_name.ilike(f"%{search}%")) |
            (Invoice.customer_phone.ilike(f"%{search}%"))
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


@router.get("/{invoice_id}/print", response_model=InvoicePrintData)
async def get_invoice_print_data(
    invoice_id: int,
    mark_printed: bool = False,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get GST tax invoice data for printing/viewing.
    Pass mark_printed=true when actually printing; later prints are marked as duplicate.
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

    # Invoices keep the store details as issued; older invoices fall back to current settings
    store = build_store_settings(db, context.tenant_id)
    store_gstin = invoice.store_gst or store.gstin
    store_state = invoice.store_state or store.store_state
    store_state_code = state_code_for(store_gstin, store_state)
    footer_text = invoice.footer_message or get_setting(
        db, context.tenant_id, "invoice_footer", "Thank you for shopping!"
    )
    tax_inclusive = get_setting(db, context.tenant_id, "tax_inclusive_pricing", "true").lower() == "true"

    # Get cashier name
    cashier = db.query(User).filter(User.id == sale.created_by).first() if sale else None

    items = []
    hsn_groups: dict = {}
    mrp_savings = Decimal("0")
    for item in (sale.items if sale else []):
        taxable = Decimal(item.taxable_value or 0) or (Decimal(item.line_total) - Decimal(item.tax_amount or 0))
        items.append({
            "product_name": item.product_name,
            "barcode": item.barcode,
            "hsn_code": item.hsn_code or "",
            "unit_type": item.unit_type or "",
            "mrp": float(item.mrp) if item.mrp is not None else None,
            "quantity": float(item.quantity),
            "unit_price": float(item.unit_price),
            "discount_percent": float(item.discount_percent or 0),
            "discount_amount": float(item.discount_amount or 0),
            "taxable_value": float(taxable),
            "tax_percent": float(item.tax_percent or 0),
            "tax_amount": float(item.tax_amount or 0),
            "cgst_amount": float(item.cgst_amount or 0),
            "sgst_amount": float(item.sgst_amount or 0),
            "igst_amount": float(item.igst_amount or 0),
            "line_total": float(item.line_total)
        })
        if item.mrp and item.mrp > item.unit_price:
            mrp_savings += (item.mrp - item.unit_price) * item.quantity

        key = (item.hsn_code or "", float(item.tax_percent or 0))
        group = hsn_groups.setdefault(key, [Decimal("0")] * 5)
        group[0] += taxable
        group[1] += Decimal(item.cgst_amount or 0)
        group[2] += Decimal(item.sgst_amount or 0)
        group[3] += Decimal(item.igst_amount or 0)
        group[4] += Decimal(item.tax_amount or 0)

    hsn_summary = [
        HsnSummaryRow(
            hsn_code=hsn, tax_percent=rate, taxable_value=float(g[0]), cgst_amount=float(g[1]),
            sgst_amount=float(g[2]), igst_amount=float(g[3]), tax_amount=float(g[4])
        )
        for (hsn, rate), g in sorted(hsn_groups.items())
    ]

    is_duplicate = (invoice.printed_count or 0) > 0
    if mark_printed:
        invoice.printed_count = (invoice.printed_count or 0) + 1
        invoice.last_printed_at = datetime.utcnow()
        db.commit()

    return InvoicePrintData(
        invoice_id=invoice.id,
        store_name=invoice.store_name or store.store_name or "Store",
        store_address=invoice.store_address or store.store_address,
        store_phone=invoice.store_contact or store.store_phone,
        store_gstin=store_gstin,
        store_state=store_state or GST_STATE_CODES.get(store_state_code, ""),
        store_state_code=store_state_code,
        store_fssai=invoice.store_fssai or store.fssai_license,
        invoice_no=invoice.invoice_no,
        invoice_date=invoice.invoice_date.isoformat() + "Z",
        sale_no=sale.sale_no if sale else None,
        customer_name=invoice.customer_name,
        customer_phone=invoice.customer_phone,
        customer_gstin=invoice.customer_gstin,
        place_of_supply=invoice.place_of_supply or format_place_of_supply(store_state_code),
        is_interstate=bool(sale.is_interstate) if sale else False,
        cashier_name=cashier.full_name if cashier else "N/A",
        items=items,
        hsn_summary=hsn_summary,
        subtotal=float(invoice.subtotal or 0),
        tax_amount=float(invoice.tax_amount or 0),
        cgst_amount=float(invoice.cgst_amount or 0),
        sgst_amount=float(invoice.sgst_amount or 0),
        igst_amount=float(invoice.igst_amount or 0),
        discount_amount=float(invoice.discount_amount or 0),
        total_amount=float(invoice.total_amount or 0),
        mrp_savings=float(round(mrp_savings, 2)),
        tax_inclusive=tax_inclusive,
        payment_mode=(sale.payment_mode if sale else None) or invoice.payment_mode or "cash",
        footer_text=footer_text,
        is_duplicate=is_duplicate
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
    
    invoice = create_invoice_for_sale(db, sale, context.tenant_id)
    db.commit()
    db.refresh(invoice)
    
    return InvoiceResponse.model_validate(invoice)

