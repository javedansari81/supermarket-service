"""
Online shop catalogue: public, read-only, no login. Only stores with online ordering switched
on and only active, priced products are shown. Prices follow billing (offers, near-expiry and
loose markdowns) for the stock that would be sold first; exact stock and costs are never shown.
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload
from app.core.batches import fefo_key, uses_batches
from app.core.clearance import ClearanceResolver, today_ist
from app.core.database import get_db
from app.core.offers import OfferResolver, SOURCE_OFFER, CENTS, resolve_line_discount
from app.core.online_orders import delivery_pincodes, delivery_settings, reserved_quantities
from app.core import product_images, storage
from app.models.category import Category
from app.models.offer import Offer, OfferItem
from app.models.product import Product
from app.models.product_batch import ProductBatch
from app.models.tenant import Tenant
from app.schemas.shop import (
    ShopStore, ShopStoreListResponse, ShopStoreDetail, ShopCategory, ShopCategoryListResponse,
    ShopProduct, ShopProductDetail, ShopProductListResponse,
)
from app.api.deps import get_shop_tenant, online_store_ids
from app.api.v1.endpoints.settings import build_store_settings

router = APIRouter()

CACHE_SECONDS = 60
LIST_PRICE = func.coalesce(Product.selling_price, Product.mrp)


def _cache(response: Response) -> None:
    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"


def sellable_products(db: Session, tenant_id: int):
    """Active products with a price"""
    return db.query(Product).filter(Product.tenant_id == tenant_id, Product.status == "active",
                                    LIST_PRICE > 0)


def price_products(db: Session, tenant_id: int, products: List[Product]) -> List[dict]:
    """Shop fields for each product: the price billing would charge for one unit now, and
    `available` = sellable stock not held by open online orders (never sent to customers)"""
    clearance = ClearanceResolver(db, tenant_id)
    offers = OfferResolver(db, tenant_id)
    reserved = reserved_quantities(db, tenant_id, [p.id for p in products])
    today = today_ist()
    packed_ids = [p.id for p in products if uses_batches(p)]
    batches: Dict[int, List[ProductBatch]] = {}
    has_batches = set()
    if packed_ids:
        for batch in db.query(ProductBatch).filter(ProductBatch.product_id.in_(packed_ids),
                                                   ProductBatch.quantity_left > 0).all():
            has_batches.add(batch.product_id)
            if batch.expiry_date is None or batch.expiry_date >= today:
                batches.setdefault(batch.product_id, []).append(batch)

    priced = []
    for product in products:
        sellable = sorted(batches.get(product.id, []), key=fefo_key)
        batch = sellable[0] if sellable else None
        if batch:
            unit_price = batch.selling_price or batch.mrp or product.selling_price or product.mrp
            mrp = batch.mrp
            stock = sum((Decimal(b.quantity_left) for b in sellable), Decimal("0"))
        else:
            unit_price = product.selling_price or product.mrp
            mrp = product.mrp
            # Packed stock not yet split into batches still counts; expired batches do not
            stock = Decimal("0") if product.id in has_batches \
                else Decimal(product.stock_quantity or 0)
        available = max(stock - reserved.get(product.id, Decimal("0")), Decimal("0"))
        unit_price = Decimal(unit_price).quantize(CENTS)
        discount = resolve_line_discount(unit_price, Decimal("1"), unit_price,
                                         clearance.percent(product, batch),
                                         offers.best(product.id, unit_price))
        priced.append({
            "id": product.id, "product_name": product.product_name, "brand": product.brand,
            "category_id": product.category_id,
            "category_name": product.category.category_name if product.category else None,
            "is_loose": product.is_loose, "unit_type": product.unit_type,
            "net_quantity": product.net_quantity, "net_unit": product.net_unit,
            "mrp": mrp, "price": unit_price, "offer_price": unit_price - discount.amount,
            "discount_percent": discount.percent if discount.amount else Decimal("0"),
            "discount_source": discount.source if discount.amount else None,
            "offer_name": discount.offer.offer.name
            if discount.amount and discount.source == SOURCE_OFFER else None,
            "in_stock": available > 0, "available": available, "description": product.description,
            "image_url": product.image_url, "thumb_url": product.thumb_url,
        })
    return priced


@router.get("/images/{key:path}")
async def get_image(key: str):
    """A product picture from object storage (when PRODUCT_IMAGE_PUBLIC_URL is not set).
    Only product image files can be read; each upload has a new name, so they cache for good."""
    if not product_images.KEY_PATTERN.match(key) or not storage.is_configured():
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        content = await run_in_threadpool(storage.get_file, key)
    except KeyError:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(content, media_type=product_images.CONTENT_TYPE,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/stores", response_model=ShopStoreListResponse)
async def list_stores(response: Response, db: Session = Depends(get_db)):
    """Stores customers can order from (the store picker)"""
    tenants = db.query(Tenant).filter(
        Tenant.status == "active", Tenant.subdomain.isnot(None), Tenant.id.in_(online_store_ids(db))
    ).order_by(Tenant.tenant_name).all()
    items = []
    for tenant in tenants:
        store = build_store_settings(db, tenant.id)
        items.append(ShopStore(store=tenant.subdomain, store_name=store.store_name,
                               store_address=store.store_address or ""))
    _cache(response)
    return ShopStoreListResponse(items=items)


@router.get("/stores/{store}", response_model=ShopStoreDetail)
async def get_store(response: Response, db: Session = Depends(get_db),
                    tenant: Tenant = Depends(get_shop_tenant)):
    """Store details for the shop header and footer (FSSAI licence must be shown for food)"""
    store = build_store_settings(db, tenant.id)
    delivery_charge, free_delivery_min = delivery_settings(db, tenant.id)
    _cache(response)
    return ShopStoreDetail(store=tenant.subdomain, delivery_charge=delivery_charge,
                           free_delivery_min=free_delivery_min,
                           delivery_pincodes=delivery_pincodes(db, tenant.id), **store.model_dump(
        include={"store_name", "store_address", "store_phone", "store_email", "gstin", "fssai_license"}
    ))


@router.get("/stores/{store}/categories", response_model=ShopCategoryListResponse)
async def list_categories(response: Response, db: Session = Depends(get_db),
                          tenant: Tenant = Depends(get_shop_tenant)):
    """Active categories that have products to sell"""
    counts = sellable_products(db, tenant.id).with_entities(
        Product.category_id, func.count(Product.id).label("product_count")
    ).group_by(Product.category_id).subquery()
    rows = db.query(Category, counts.c.product_count).join(
        counts, counts.c.category_id == Category.id
    ).filter(
        Category.tenant_id == tenant.id, Category.status == "active"
    ).order_by(Category.category_name).all()
    _cache(response)
    return ShopCategoryListResponse(items=[
        ShopCategory(id=c.id, category_name=c.category_name, product_count=n) for c, n in rows
    ])


@router.get("/stores/{store}/products", response_model=ShopProductListResponse)
async def list_products(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    category_id: Optional[int] = None,
    search: Optional[str] = Query(None, max_length=100),
    sort: str = Query("name", pattern="^(name|price_asc|price_desc)$"),
    on_offer: bool = False,
    ids: Optional[str] = Query(None, pattern=r"^[0-9]+(,[0-9]+){0,49}$"),
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_shop_tenant)
):
    """Products to browse or search; in-stock products come first. on_offer = in a running
    offer or with a loose markdown today; ids = only these products (e.g. recently viewed)."""
    query = sellable_products(db, tenant.id).options(joinedload(Product.category))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if ids:
        query = query.filter(Product.id.in_({int(i) for i in ids.split(",")}))
    if on_offer:
        today = today_ist()
        running = db.query(OfferItem.product_id).join(Offer).filter(
            Offer.tenant_id == tenant.id, Offer.is_active.is_(True),
            Offer.start_date <= today, Offer.end_date >= today)
        query = query.filter(or_(
            Product.id.in_(running),
            and_(Product.markdown_percent > 0, Product.markdown_until > datetime.utcnow()),
        ))
    words = search.split() if search else []
    for word in words:
        pattern = f"%{word}%"
        query = query.filter(or_(Product.product_name.ilike(pattern), Product.brand.ilike(pattern)))

    total = query.count()
    order = [(func.coalesce(Product.stock_quantity, 0) > 0).desc()]
    if words:
        order.append(Product.product_name.ilike(f"{words[0]}%").desc())
    if sort == "price_asc":
        order.append(LIST_PRICE.asc())
    elif sort == "price_desc":
        order.append(LIST_PRICE.desc())
    order += [Product.product_name, Product.id]
    products = query.order_by(*order).offset((page - 1) * page_size).limit(page_size).all()
    _cache(response)
    return ShopProductListResponse(
        items=[ShopProduct(**p) for p in price_products(db, tenant.id, products)],
        total=total, page=page, page_size=page_size
    )


@router.get("/stores/{store}/products/{product_id}", response_model=ShopProductDetail)
async def get_product(product_id: int, response: Response, db: Session = Depends(get_db),
                      tenant: Tenant = Depends(get_shop_tenant)):
    """One product with its description"""
    product = sellable_products(db, tenant.id).options(joinedload(Product.category)).filter(
        Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _cache(response)
    return ShopProductDetail(**price_products(db, tenant.id, [product])[0])
