"""
GST lookup item endpoints
"""
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.category import Category
from app.models.gst_item import GstItem, CategoryGstItem
from app.schemas.gst_item import GstItemResponse
from app.api.deps import get_tenant_context, TenantContext

router = APIRouter()


@router.get("", response_model=List[GstItemResponse])
async def list_gst_items(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Active GST items with the category each one is listed under for the current tenant
    """
    rows = db.query(GstItem, Category.id, Category.category_name).outerjoin(
        CategoryGstItem,
        (CategoryGstItem.gst_item_id == GstItem.id) & (CategoryGstItem.tenant_id == context.tenant_id)
    ).outerjoin(
        Category, Category.id == CategoryGstItem.category_id
    ).filter(GstItem.status == "active").order_by(GstItem.item_name).all()

    return [
        GstItemResponse(
            id=item.id, item_name=item.item_name, hsn_code=item.hsn_code,
            gst_percent_loose=item.gst_percent_loose, gst_percent_packed=item.gst_percent_packed,
            category_id=category_id, category_name=category_name
        )
        for item, category_id, category_name in rows
    ]
