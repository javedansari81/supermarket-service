"""
Near-expiry (clearance) discount endpoints (admin only)
"""
from datetime import timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.clearance import ClearanceResolver, CLEARANCE_ENABLED_KEY, end_of_today_utc
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.clearance_rule import ClearanceRule
from app.models.product import Product
from app.models.product_batch import ProductBatch
from app.schemas.clearance import (
    ClearanceTiersIn, ClearanceRuleResponse, ClearanceRulesResponse, ClearanceSettingsIn,
    MarkdownIn, NearExpiryBatch, LooseMarkdownItem, NearExpiryResponse
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext
from app.api.v1.endpoints.settings import upsert_settings

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


def to_rule_response(rule: ClearanceRule) -> ClearanceRuleResponse:
    return ClearanceRuleResponse(
        id=rule.id, category_id=rule.category_id, product_id=rule.product_id, tiers=rule.tiers or [],
        category_name=rule.category.category_name if rule.category else None,
        product_name=rule.product.product_name if rule.product else None,
    )


def find_rule(db: Session, tenant_id: int, category_id: Optional[int] = None,
              product_id: Optional[int] = None) -> Optional[ClearanceRule]:
    return db.query(ClearanceRule).filter(
        ClearanceRule.tenant_id == tenant_id,
        ClearanceRule.category_id.is_(None) if category_id is None else ClearanceRule.category_id == category_id,
        ClearanceRule.product_id.is_(None) if product_id is None else ClearanceRule.product_id == product_id,
    ).first()


def ensure_scope(db: Session, tenant_id: int, category_id: Optional[int], product_id: Optional[int]):
    model, entity_id = (Category, category_id) if category_id else (Product, product_id)
    if entity_id and not db.query(model.id).filter(model.id == entity_id, model.tenant_id == tenant_id).first():
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")


def save_rule(db: Session, request: Request, context: TenantContext, data: ClearanceTiersIn,
              category_id: Optional[int] = None, product_id: Optional[int] = None) -> ClearanceRuleResponse:
    ensure_scope(db, context.tenant_id, category_id, product_id)
    rule = find_rule(db, context.tenant_id, category_id, product_id)
    old_value = snapshot(rule)
    if not rule:
        rule = ClearanceRule(tenant_id=context.tenant_id, category_id=category_id, product_id=product_id)
        db.add(rule)
    rule.tiers = [{"days_left": t.days_left, "percent": float(t.percent)} for t in data.tiers]
    rule.updated_by = context.user_id
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id,
                 AuditLog.ACTION_UPDATE if old_value else AuditLog.ACTION_CREATE,
                 "clearance_rule", rule.id, old_value=old_value, new_value=snapshot(rule))
    db.commit()
    db.refresh(rule)
    return to_rule_response(rule)


def delete_rule(db: Session, request: Request, context: TenantContext,
                category_id: Optional[int] = None, product_id: Optional[int] = None) -> None:
    rule = find_rule(db, context.tenant_id, category_id, product_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Clearance rule not found")
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "clearance_rule", rule.id, old_value=snapshot(rule))
    db.delete(rule)
    db.commit()


@router.get("/rules", response_model=ClearanceRulesResponse)
async def list_rules(db: Session = Depends(get_db), context: TenantContext = Depends(get_tenant_context)):
    """Store default tiers and category / product overrides"""
    rules = db.query(ClearanceRule).options(
        joinedload(ClearanceRule.category), joinedload(ClearanceRule.product)
    ).filter(ClearanceRule.tenant_id == context.tenant_id).order_by(ClearanceRule.id).all()
    default = next((r for r in rules if not r.category_id and not r.product_id), None)
    return ClearanceRulesResponse(
        enabled=ClearanceResolver(db, context.tenant_id).enabled,
        default=to_rule_response(default) if default else ClearanceRuleResponse(tiers=ClearanceRule.DEFAULT_TIERS),
        categories=[to_rule_response(r) for r in rules if r.category_id],
        products=[to_rule_response(r) for r in rules if r.product_id],
    )


@router.put("/settings", response_model=ClearanceSettingsIn)
async def update_settings(data: ClearanceSettingsIn, request: Request, db: Session = Depends(get_db),
                          context: TenantContext = Depends(get_tenant_context)):
    """Switch near-expiry discount tiers on or off for the store"""
    old = ClearanceResolver(db, context.tenant_id).enabled
    upsert_settings(db, context.tenant_id, {CLEARANCE_ENABLED_KEY: "true" if data.enabled else "false"})
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE, "settings",
                 old_value={CLEARANCE_ENABLED_KEY: old}, new_value={CLEARANCE_ENABLED_KEY: data.enabled})
    db.commit()
    return data


@router.put("/rules/default", response_model=ClearanceRuleResponse)
async def update_default_rule(data: ClearanceTiersIn, request: Request, db: Session = Depends(get_db),
                              context: TenantContext = Depends(get_tenant_context)):
    return save_rule(db, request, context, data)


@router.put("/rules/category/{category_id}", response_model=ClearanceRuleResponse)
async def update_category_rule(category_id: int, data: ClearanceTiersIn, request: Request,
                               db: Session = Depends(get_db),
                               context: TenantContext = Depends(get_tenant_context)):
    return save_rule(db, request, context, data, category_id=category_id)


@router.delete("/rules/category/{category_id}", status_code=204)
async def delete_category_rule(category_id: int, request: Request, db: Session = Depends(get_db),
                               context: TenantContext = Depends(get_tenant_context)):
    """Remove the override; the category follows the store default again"""
    delete_rule(db, request, context, category_id=category_id)


@router.put("/rules/product/{product_id}", response_model=ClearanceRuleResponse)
async def update_product_rule(product_id: int, data: ClearanceTiersIn, request: Request,
                              db: Session = Depends(get_db),
                              context: TenantContext = Depends(get_tenant_context)):
    return save_rule(db, request, context, data, product_id=product_id)


@router.delete("/rules/product/{product_id}", status_code=204)
async def delete_product_rule(product_id: int, request: Request, db: Session = Depends(get_db),
                              context: TenantContext = Depends(get_tenant_context)):
    """Remove the override; the product follows its category or the store default again"""
    delete_rule(db, request, context, product_id=product_id)


@router.get("/near-expiry", response_model=NearExpiryResponse)
async def near_expiry(days: int = Query(30, ge=0, le=730), db: Session = Depends(get_db),
                      context: TenantContext = Depends(get_tenant_context)):
    """Packed batches expiring within `days` (expired ones too) with the % billing applies,
    and loose items in stock with today's markdown"""
    clearance = ClearanceResolver(db, context.tenant_id)
    batches = db.query(ProductBatch).join(Product).options(
        joinedload(ProductBatch.product).joinedload(Product.category)
    ).filter(
        ProductBatch.tenant_id == context.tenant_id,
        Product.status == "active",
        ProductBatch.quantity_left > 0,
        ProductBatch.expiry_date.isnot(None),
        ProductBatch.expiry_date <= clearance.today + timedelta(days=days),
    ).order_by(ProductBatch.expiry_date, Product.product_name).all()
    loose = db.query(Product).options(joinedload(Product.category)).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active",
        Product.product_type == Product.TYPE_LOOSE,
        Product.stock_quantity > 0,
    ).order_by(Product.product_name).all()
    return NearExpiryResponse(
        enabled=clearance.enabled, days=days,
        batches=[NearExpiryBatch(
            batch_id=b.id, product_id=b.product_id, product_name=b.product.product_name,
            category_name=b.product.category.category_name if b.product.category else None,
            batch_no=b.batch_no, mrp=b.mrp, selling_price=b.selling_price, expiry_date=b.expiry_date,
            days_left=clearance.days_left(b.expiry_date), quantity_left=b.quantity_left,
            clearance_percent=clearance.percent(b.product, b),
        ) for b in batches],
        loose_items=[LooseMarkdownItem(
            product_id=p.id, product_name=p.product_name, unit_type=p.unit_type,
            category_name=p.category.category_name if p.category else None,
            selling_price=p.selling_price, stock_quantity=p.stock_quantity or 0,
            markdown_percent=p.active_markdown_percent or 0,
            markdown_until=p.markdown_until if p.active_markdown_percent else None,
        ) for p in loose],
    )


@router.put("/markdown/{product_id}", response_model=LooseMarkdownItem)
async def set_markdown(product_id: int, data: MarkdownIn, request: Request, db: Session = Depends(get_db),
                       context: TenantContext = Depends(get_tenant_context)):
    """Set today's markdown on a loose item; it lapses at midnight (IST). 0 removes it."""
    product = db.query(Product).filter(Product.id == product_id, Product.tenant_id == context.tenant_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.product_type != Product.TYPE_LOOSE:
        raise HTTPException(status_code=400, detail="Markdown is for loose items; packed items use clearance tiers")
    old_value = {"markdown_percent": product.active_markdown_percent}
    if data.percent > 0:
        product.markdown_percent = data.percent
        product.markdown_until = end_of_today_utc()
    else:
        product.markdown_percent = product.markdown_until = None
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE, "product",
                 product.id, old_value=old_value, new_value={"markdown_percent": data.percent})
    db.commit()
    db.refresh(product)
    return LooseMarkdownItem(
        product_id=product.id, product_name=product.product_name, unit_type=product.unit_type,
        category_name=product.category.category_name if product.category else None,
        selling_price=product.selling_price, stock_quantity=product.stock_quantity or 0,
        markdown_percent=product.active_markdown_percent or Decimal("0"),
        markdown_until=product.markdown_until,
    )
