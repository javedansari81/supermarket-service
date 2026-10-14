"""
Barcode management endpoints
"""
import io
import csv
import base64
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from barcode import Code128
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFont
from app.core.database import get_db
from app.models.product import Product
from app.models.barcode_config import BarcodeConfig
from app.models.tenant_setting import TenantSetting
from app.schemas.barcode import (
    BarcodeConfigCreate, BarcodeConfigUpdate, BarcodeConfigResponse,
    BarcodeConfigListResponse, BarcodePrintRequest, BarcodeLabelData,
    PackedLabelRequest, PackedLabelData
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext
from app.core.batches import generate_instore_barcode, SCALE_PREFIX
from app.api.v1.endpoints.settings import build_store_settings

# unit -> (base unit, factor to base unit)
NET_UNITS = {
    "g": ("g", Decimal("1")), "kg": ("g", Decimal("1000")),
    "ml": ("ml", Decimal("1")), "L": ("ml", Decimal("1000")),
    "pcs": ("pcs", Decimal("1")), "pages": ("pages", Decimal("1")),
}


def format_net_quantity(qty: Decimal, unit: str) -> str:
    """Format net quantity using the standard unit (e.g. 500 g, 1.5 kg)"""
    base, factor = NET_UNITS[unit]
    base_qty = qty * factor
    if base in ("g", "ml") and base_qty >= 1000:
        value, label = base_qty / 1000, "kg" if base == "g" else "L"
    else:
        value, label = base_qty, {"g": "g", "ml": "ml", "pcs": "N", "pages": "pages"}[base]
    return f"{value.normalize():f} {label}"


def unit_sale_price(mrp: Decimal, qty: Decimal, unit: str) -> Optional[str]:
    """Unit sale price per Legal Metrology rule 6(11): per g/ml below 1 kg/L, per kg/L otherwise"""
    base, factor = NET_UNITS[unit]
    base_qty = qty * factor
    if base == "pages":
        return None
    if base == "pcs":
        return None if base_qty == 1 else f"₹{mrp / base_qty:.2f} per N"
    if base_qty == 1000:
        return None
    big = "kg" if base == "g" else "L"
    if base_qty < 1000:
        return f"₹{mrp / base_qty:.2f} per {base}"
    return f"₹{mrp * 1000 / base_qty:.2f} per {big}"

router = APIRouter()


def get_store_name(db: Session, tenant_id: int) -> str:
    """Get store name from tenant settings"""
    setting = db.query(TenantSetting).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key == "store_name"
    ).first()
    return setting.setting_value if setting else "Store"


def generate_barcode_image(barcode_value: str) -> str:
    """Generate barcode image and return as base64"""
    buffer = io.BytesIO()
    code = Code128(barcode_value, writer=ImageWriter())
    code.write(buffer, options={"write_text": False, "module_height": 10})
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode()


def assign_instore_barcode(db: Session, product: Product) -> str:
    """Give an own-packed product its in-store barcode if it has none"""
    if product.barcode:
        return product.barcode
    new_barcode = generate_instore_barcode(product.id)
    existing = db.query(Product).filter(
        Product.tenant_id == product.tenant_id,
        Product.barcode == new_barcode,
        Product.id != product.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Generated barcode already exists")
    product.barcode = new_barcode
    db.flush()
    return new_barcode


def build_label(product: Product, store_name: str) -> BarcodeLabelData:
    """Build printable label data for a product"""
    return BarcodeLabelData(
        store_name=store_name,
        product_no=product.product_no,
        product_name=product.product_name,
        barcode=product.barcode,
        mrp=f"₹{product.mrp:.2f}" if product.mrp else "N/A",
        selling_price=f"₹{product.selling_price:.2f}" if product.selling_price else None,
        unit_type=product.unit_type or "pcs",
        is_loose=bool(product.is_loose),
        product_type=product.product_type,
        plu_code=product.plu_code,
        barcode_image=generate_barcode_image(product.barcode)
    )


@router.get("/configs", response_model=BarcodeConfigListResponse)
async def list_barcode_configs(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List barcode configurations
    """
    configs = db.query(BarcodeConfig).filter(
        BarcodeConfig.tenant_id == context.tenant_id
    ).all()
    
    return BarcodeConfigListResponse(
        items=[BarcodeConfigResponse.model_validate(c) for c in configs]
    )


@router.post("/configs", response_model=BarcodeConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_barcode_config(
    config_data: BarcodeConfigCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create barcode configuration (admin only)
    """
    # Check for duplicate name
    existing = db.query(BarcodeConfig).filter(
        BarcodeConfig.tenant_id == context.tenant_id,
        BarcodeConfig.config_name == config_data.config_name
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Config name already exists")
    
    # If this is set as default, unset other defaults
    if config_data.is_default:
        db.query(BarcodeConfig).filter(
            BarcodeConfig.tenant_id == context.tenant_id
        ).update({"is_default": False})
    
    config = BarcodeConfig(
        tenant_id=context.tenant_id,
        **config_data.model_dump()
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    
    return BarcodeConfigResponse.model_validate(config)


@router.get("/scale-export")
async def export_scale_items(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    CSV of active loose products for loading into the weighing scale (admin only).
    The scale prints labels 21 + PLU (5 digits) + weight in g/ml (5 digits) + check digit.
    """
    products = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.product_type == Product.TYPE_LOOSE,
        Product.status == "active",
        Product.plu_code.isnot(None)
    ).order_by(Product.plu_code).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["PLU", "Item Name", "Rate", "Unit", "Barcode Prefix", "Barcode Format",
                     "Product No", "HSN Code", "Tax %"])
    for product in products:
        rate = product.selling_price or product.mrp or 0
        writer.writerow([product.plu_code, product.product_name, f"{rate:.2f}", product.unit_type,
                         SCALE_PREFIX, "21PPPPPWWWWWC (weight in g/ml)", product.product_no,
                         product.hsn_code or "", f"{product.tax_percent or 0:.2f}"])
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="scale_items.csv"'}
    )


@router.get("/generate/{product_id}")
async def generate_barcode(
    product_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Generate barcode for a product
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if not product.barcode:
        raise HTTPException(status_code=400, detail="Product has no barcode")
    
    return build_label(product, get_store_name(db, context.tenant_id))


@router.post("/print")
async def print_barcodes(
    request: BarcodePrintRequest,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Reprint the maker's barcode for manufacturer products (e.g. damaged labels)
    """
    store_name = get_store_name(db, context.tenant_id)
    labels = []

    for product_id in request.product_ids:
        product = db.query(Product).filter(
            Product.id == product_id,
            Product.tenant_id == context.tenant_id
        ).first()

        if not product:
            continue

        if product.product_type != Product.TYPE_MANUFACTURER:
            raise HTTPException(
                status_code=400,
                detail=f"{product.product_name} is not a manufacturer product; use Own Packed Labels "
                       "for own-packed items (loose items are labelled by the weighing scale)"
            )
        if not product.barcode:
            raise HTTPException(
                status_code=400,
                detail=f"Enter the maker's barcode of {product.product_name} in Products"
            )

        label = build_label(product, store_name)

        # Add copies
        for _ in range(request.copies):
            labels.append(label)

    return {"labels": labels, "count": len(labels)}


@router.post("/packed-labels")
async def print_packed_labels(
    request: PackedLabelRequest,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Generate Legal Metrology labels for goods packed in-store
    """
    product = db.query(Product).filter(
        Product.id == request.product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.is_loose:
        raise HTTPException(
            status_code=400,
            detail="Create a packed product (e.g. 'Toor Dal 1 kg') for packed-goods labels"
        )
    if product.product_type == Product.TYPE_MANUFACTURER:
        raise HTTPException(
            status_code=400,
            detail="Manufacturer products carry the maker's label; packed-goods labels are for own-packed products"
        )
    if not product.net_quantity or product.net_unit not in NET_UNITS:
        raise HTTPException(
            status_code=400,
            detail=f"Set the pack size of {product.product_name} in Products"
        )
    mrp = product.mrp
    best_before = request.best_before_date
    if not mrp:
        raise HTTPException(
            status_code=400,
            detail=f"Set the MRP of {product.product_name} (required on packed-goods labels)"
        )

    store = build_store_settings(db, context.tenant_id)
    barcode_value = assign_instore_barcode(db, product)

    label = PackedLabelData(
        store_name=store.store_name or "Store",
        store_address=store.store_address or "",
        store_phone=store.store_phone or "",
        store_email=store.store_email or "",
        fssai_license=store.fssai_license or "",
        product_name=product.product_name,
        barcode=barcode_value,
        barcode_image=generate_barcode_image(barcode_value),
        net_quantity=format_net_quantity(product.net_quantity, product.net_unit),
        mrp=f"₹{mrp:.2f}",
        unit_sale_price=unit_sale_price(mrp, product.net_quantity, product.net_unit),
        packed_date=request.packed_date.strftime("%d/%m/%Y"),
        best_before_date=best_before.strftime("%d/%m/%Y") if best_before else None
    )
    db.commit()
    return {"labels": [label] * request.copies, "count": request.copies}


@router.post("/generate-code")
async def generate_new_barcode(
    product_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Generate an in-store barcode for an own-packed product (admin only)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.barcode:
        return {"barcode": product.barcode, "message": "Product already has a barcode"}

    if product.product_type == Product.TYPE_MANUFACTURER:
        raise HTTPException(status_code=400, detail="Enter the maker's barcode in Products")
    if product.product_type == Product.TYPE_LOOSE:
        raise HTTPException(status_code=400, detail="Loose items are labelled by the weighing scale")

    new_barcode = assign_instore_barcode(db, product)
    db.commit()

    return {"barcode": new_barcode, "message": "Barcode generated successfully"}

