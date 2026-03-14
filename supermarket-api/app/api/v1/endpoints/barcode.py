"""
Barcode management endpoints
"""
import io
import base64
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
    BarcodeConfigListResponse, BarcodePrintRequest, BarcodeLabelData
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

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
    
    store_name = get_store_name(db, context.tenant_id)
    barcode_image = generate_barcode_image(product.barcode)
    
    return BarcodeLabelData(
        store_name=store_name,
        product_no=product.product_no,
        product_name=product.product_name,
        barcode=product.barcode,
        mrp=f"₹{product.mrp:.2f}" if product.mrp else "N/A",
        barcode_image=barcode_image
    )


@router.post("/print")
async def print_barcodes(
    request: BarcodePrintRequest,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Generate barcode labels for printing
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
        
        if not product.barcode:
            continue
        
        barcode_image = generate_barcode_image(product.barcode)
        
        label = BarcodeLabelData(
            store_name=store_name,
            product_no=product.product_no,
            product_name=product.product_name,
            barcode=product.barcode,
            mrp=f"₹{product.mrp:.2f}" if product.mrp else "N/A",
            barcode_image=barcode_image
        )
        
        # Add copies
        for _ in range(request.copies):
            labels.append(label)
    
    return {"labels": labels, "count": len(labels)}


@router.post("/generate-code")
async def generate_new_barcode(
    product_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Generate a new barcode for a product (admin only)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Generate barcode based on tenant and product ID
    new_barcode = f"{context.tenant_id:03d}{product.id:09d}"
    
    # Check if barcode already exists
    existing = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.barcode == new_barcode,
        Product.id != product_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Generated barcode already exists")
    
    product.barcode = new_barcode
    db.commit()
    
    return {"barcode": new_barcode, "message": "Barcode generated successfully"}

