"""
GST return reports: GSTR-1 (outward supplies, HSN summary, documents) and GSTR-3B (summary
with input tax credit). Figures are worked out from bills, credit notes and purchases in an
IST date range; they help prepare the return and are not filed from here.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.purchase import Purchase, PurchaseItem
from app.models.sale import Sale, SaleItem
from app.models.sale_return import SaleReturn, SaleReturnItem
from app.schemas.settings import state_code_for
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext
from app.api.v1.endpoints.reports import (
    BILLED_STATUSES, IST_OFFSET, ist_day_start_utc, validate_date_range
)
from app.api.v1.endpoints.settings import build_store_settings

router = APIRouter()

ZERO = Decimal("0")
HEADS = ("igst", "cgst", "sgst")
# Inter-state bills to unregistered buyers above this value are B2C (Large), GSTR-1 table 5
B2CL_LIMIT = Decimal("100000")
# Unit -> GST unit quantity code (UQC) for the HSN summary
UQC_CODES = {"pcs": "NOS", "pages": "NOS", "kg": "KGS", "g": "GMS", "L": "LTR", "ml": "MLT"}


def money(value: Decimal) -> float:
    return float(round(value, 2))


@dataclass
class Amounts:
    """Taxable value and GST by head"""
    taxable_value: Decimal = ZERO
    igst: Decimal = ZERO
    cgst: Decimal = ZERO
    sgst: Decimal = ZERO

    def add(self, line, sign: int = 1) -> None:
        self.taxable_value += sign * (line.taxable_value or ZERO)
        self.igst += sign * (line.igst or ZERO)
        self.cgst += sign * (line.cgst or ZERO)
        self.sgst += sign * (line.sgst or ZERO)

    @property
    def tax(self) -> Decimal:
        return self.igst + self.cgst + self.sgst

    def is_zero(self) -> bool:
        return not (self.taxable_value or self.igst or self.cgst or self.sgst)

    def as_dict(self) -> dict:
        return {"taxable_value": money(self.taxable_value), "igst": money(self.igst),
                "cgst": money(self.cgst), "sgst": money(self.sgst)}


@dataclass
class Document:
    """One invoice or credit note with its amounts by GST rate"""
    number: str
    day: str
    value: Decimal
    gstin: Optional[str]
    name: Optional[str]
    place_of_supply: str
    rates: Dict[Decimal, Amounts] = field(default_factory=dict)

    def add(self, line, sign: int = 1) -> None:
        self.rates.setdefault(line.rate, Amounts()).add(line, sign)

    def as_dict(self, number_key: str, date_key: str, value_key: str) -> dict:
        row = {number_key: self.number, date_key: self.day, value_key: money(self.value),
               "place_of_supply": self.place_of_supply}
        if self.gstin:
            row.update(gstin=self.gstin, receiver_name=self.name or "")
        row["rates"] = [{"rate": float(rate), **amounts.as_dict()}
                        for rate, amounts in sorted(self.rates.items()) if not amounts.is_zero()]
        return row


def ist_day(value) -> str:
    return (value + IST_OFFSET).date().isoformat()


def period_bounds(from_date: date, to_date: date):
    validate_date_range(from_date, to_date)
    return ist_day_start_utc(from_date), ist_day_start_utc(to_date + timedelta(days=1))


def sold_lines(db: Session, tenant_id: int, start, end):
    """Billed sale lines (voided bills left out) with their bill details"""
    return db.query(
        Sale.id.label("doc_id"), Invoice.invoice_no.label("number"), Sale.sale_no,
        Sale.sale_date.label("doc_date"), Sale.total_amount.label("doc_value"),
        Sale.customer_gstin.label("gstin"), Sale.customer_name.label("name"),
        Sale.place_of_supply, Sale.is_interstate, Sale.total_amount.label("bill_value"),
        SaleItem.hsn_code, SaleItem.unit_type, SaleItem.quantity,
        func.coalesce(SaleItem.tax_percent, 0).label("rate"), SaleItem.taxable_value,
        SaleItem.igst_amount.label("igst"), SaleItem.cgst_amount.label("cgst"),
        SaleItem.sgst_amount.label("sgst")
    ).join(SaleItem, SaleItem.sale_id == Sale.id).outerjoin(
        Invoice, Invoice.sale_id == Sale.id
    ).filter(
        Sale.tenant_id == tenant_id, Sale.sale_date >= start, Sale.sale_date < end,
        Sale.status.in_(BILLED_STATUSES)
    ).order_by(Sale.sale_date, Sale.id).all()


def returned_lines(db: Session, tenant_id: int, start, end):
    """Credit note lines by return date, with the original bill's details"""
    return db.query(
        SaleReturn.id.label("doc_id"), SaleReturn.return_no.label("number"),
        SaleReturn.return_date.label("doc_date"), SaleReturn.total_amount.label("doc_value"),
        Sale.customer_gstin.label("gstin"), Sale.customer_name.label("name"),
        Sale.place_of_supply, Sale.is_interstate, Sale.total_amount.label("bill_value"),
        SaleItem.hsn_code, SaleReturnItem.unit_type, SaleReturnItem.quantity,
        func.coalesce(SaleReturnItem.tax_percent, 0).label("rate"), SaleReturnItem.taxable_value,
        SaleReturnItem.igst_amount.label("igst"), SaleReturnItem.cgst_amount.label("cgst"),
        SaleReturnItem.sgst_amount.label("sgst")
    ).join(Sale, Sale.id == SaleReturn.sale_id).join(
        SaleReturnItem, SaleReturnItem.return_id == SaleReturn.id
    ).join(SaleItem, SaleItem.id == SaleReturnItem.sale_item_id).filter(
        SaleReturn.tenant_id == tenant_id, SaleReturn.return_date >= start,
        SaleReturn.return_date < end
    ).order_by(SaleReturn.return_date, SaleReturn.id).all()


def is_b2cl(line) -> bool:
    return not line.gstin and bool(line.is_interstate) and (line.bill_value or ZERO) > B2CL_LIMIT


NIL_ROWS = (
    ((False, True), "Intra-state supplies to registered persons"),
    ((False, False), "Intra-state supplies to unregistered persons"),
    ((True, True), "Inter-state supplies to registered persons"),
    ((True, False), "Inter-state supplies to unregistered persons"),
)


def documents_issued(db: Session, tenant_id: int, start, end) -> List[dict]:
    """GSTR-1 table 13: invoice and credit note number ranges; voided bills are cancelled"""
    invoices = db.query(
        func.min(Invoice.invoice_no), func.max(Invoice.invoice_no), func.count(Invoice.id),
        func.count(case((Sale.status == "cancelled", 1)))
    ).join(Sale, Sale.id == Invoice.sale_id).filter(
        Sale.tenant_id == tenant_id, Sale.sale_date >= start, Sale.sale_date < end
    ).one()
    notes = db.query(
        func.min(SaleReturn.return_no), func.max(SaleReturn.return_no), func.count(SaleReturn.id)
    ).filter(
        SaleReturn.tenant_id == tenant_id, SaleReturn.return_date >= start, SaleReturn.return_date < end
    ).one()
    rows = []
    for nature, (first, last, total, cancelled) in (("Invoices for outward supply", tuple(invoices)),
                                                     ("Credit notes", (*notes, 0))):
        if total:
            rows.append({"nature": nature, "from_no": first, "to_no": last, "total": total,
                         "cancelled": cancelled, "net_issued": total - cancelled})
    return rows


def store_warnings(store) -> List[str]:
    return [] if store.gstin else ["Store GSTIN is not set in Settings; set it before filing"]


@router.get("/gstr1")
async def get_gstr1(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    GSTR-1 tables (admin only): B2B (4A), B2C Large (5), B2C Small (7, net of its credit
    notes), nil rated / exempt (8), credit notes to registered (9B CDNR) and B2C Large
    (9B CDNUR) buyers, HSN summary for B2B and B2C (12) and documents issued (13).
    Bills count by bill date and credit notes by return date (IST); voided bills are left out.
    """
    start, end = period_bounds(from_date, to_date)
    store = build_store_settings(db, context.tenant_id)
    b2b: Dict[int, Document] = {}
    b2cl: Dict[int, Document] = {}
    cdnr: Dict[int, Document] = {}
    cdnur: Dict[int, Document] = {}
    b2cs: Dict[tuple, Amounts] = {}
    nil = {key: ZERO for key, _ in NIL_ROWS}
    hsn: Dict[str, Dict[tuple, list]] = {"b2b": {}, "b2c": {}}
    totals = Amounts()
    missing_hsn = 0

    def document(store_: Dict[int, Document], line) -> Document:
        if line.doc_id not in store_:
            store_[line.doc_id] = Document(
                number=line.number or getattr(line, "sale_no", None) or "", day=ist_day(line.doc_date),
                value=line.doc_value or ZERO, gstin=line.gstin, name=line.name,
                place_of_supply=line.place_of_supply or "")
        return store_[line.doc_id]

    for sign, lines in ((1, sold_lines(db, context.tenant_id, start, end)),
                        (-1, returned_lines(db, context.tenant_id, start, end))):
        for line in lines:
            key = (line.hsn_code or "", UQC_CODES.get(line.unit_type or "", "OTH"), line.rate)
            group = hsn["b2b" if line.gstin else "b2c"].setdefault(key, [ZERO, Amounts()])
            group[0] += sign * (line.quantity or ZERO)
            group[1].add(line, sign)
            totals.add(line, sign)
            if sign > 0 and not line.hsn_code:
                missing_hsn += 1
            if line.rate == 0:
                nil[(bool(line.is_interstate), bool(line.gstin))] += sign * (line.taxable_value or ZERO)
            elif line.gstin:
                document(b2b if sign > 0 else cdnr, line).add(line)
            elif is_b2cl(line):
                document(b2cl if sign > 0 else cdnur, line).add(line)
            else:
                b2cs.setdefault((line.place_of_supply or "", line.rate), Amounts()).add(line, sign)

    warnings = store_warnings(store)
    if missing_hsn:
        warnings.append(f"{missing_hsn} bill line(s) have no HSN code; set HSN on those products")
    if any(nil.values()):
        warnings.append("0% items are shown together as nil rated / exempt; split them as your CA advises")

    def hsn_rows(groups: Dict[tuple, list]) -> List[dict]:
        return [{"hsn_code": code, "uqc": uqc, "rate": float(rate), "quantity": float(qty),
                 **amounts.as_dict(), "total_value": money(amounts.taxable_value + amounts.tax)}
                for (code, uqc, rate), (qty, amounts) in sorted(groups.items())]

    return {
        "from_date": from_date, "to_date": to_date, "store_gstin": store.gstin,
        "b2b": [d.as_dict("invoice_no", "invoice_date", "invoice_value") for d in b2b.values()],
        "b2cl": [d.as_dict("invoice_no", "invoice_date", "invoice_value") for d in b2cl.values()],
        "b2cs": [{"place_of_supply": pos, "rate": float(rate), **amounts.as_dict()}
                 for (pos, rate), amounts in sorted(b2cs.items()) if not amounts.is_zero()],
        "nil_exempt": [{"description": label, "nil_rated_exempt": money(nil[key])} for key, label in NIL_ROWS],
        "cdnr": [d.as_dict("note_no", "note_date", "note_value") for d in cdnr.values()],
        "cdnur": [{**d.as_dict("note_no", "note_date", "note_value"), "ur_type": "B2CL"} for d in cdnur.values()],
        "hsn_b2b": hsn_rows(hsn["b2b"]),
        "hsn_b2c": hsn_rows(hsn["b2c"]),
        "documents": documents_issued(db, context.tenant_id, start, end),
        "totals": {**totals.as_dict(), "total_tax": money(totals.tax)},
        "warnings": warnings,
    }


def estimate_set_off(liability: Dict[str, Decimal], credit: Dict[str, Decimal]):
    """Use input tax credit against output tax in the legal order: IGST credit first (IGST,
    then CGST / SGST, covering what their own credit cannot); then CGST credit (CGST, then
    IGST) and SGST credit (SGST, then IGST). CGST and SGST credit never cross."""
    due = dict(liability)
    left = dict(credit)
    paid = {head: {src: ZERO for src in HEADS} for head in HEADS}

    def use(src: str, head: str, limit: Optional[Decimal] = None) -> None:
        amount = min(left[src], due[head] if limit is None else min(limit, due[head]))
        if amount > 0:
            left[src] -= amount
            due[head] -= amount
            paid[head][src] += amount

    use("igst", "igst")
    for head in ("cgst", "sgst"):
        use("igst", head, limit=max(due[head] - left[head], ZERO))
    for head in ("cgst", "sgst"):
        use("igst", head)
    use("cgst", "cgst")
    use("sgst", "sgst")
    use("cgst", "igst")
    use("sgst", "igst")
    rows = [{"head": head, "liability": money(liability[head]),
             **{f"paid_by_{src}_credit": money(paid[head][src]) for src in HEADS},
             "cash": money(due[head])} for head in HEADS]
    return rows, {head: money(left[head]) for head in HEADS}


@router.get("/gstr3b")
async def get_gstr3b(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    GSTR-3B summary (admin only): 3.1(a) taxable outward supplies and 3.1(c) nil rated /
    exempt (both net of credit notes), 3.2 inter-state supplies to unregistered buyers,
    4 input tax credit from GST bill purchase lines with GST % shown, 5 exempt / nil /
    no-GST purchases, and an estimate of tax paid by credit and in cash (6.1).
    """
    start, end = period_bounds(from_date, to_date)
    store = build_store_settings(db, context.tenant_id)
    store_state = store.store_state_code or ""
    outward = Amounts()
    nil = ZERO
    interstate: Dict[str, Amounts] = {}
    for sign, lines in ((1, sold_lines(db, context.tenant_id, start, end)),
                        (-1, returned_lines(db, context.tenant_id, start, end))):
        for line in lines:
            if line.rate == 0:
                nil += sign * (line.taxable_value or ZERO)
                continue
            outward.add(line, sign)
            if line.is_interstate and not line.gstin:
                interstate.setdefault(line.place_of_supply or "", Amounts()).add(line, sign)

    purchases = db.query(
        Purchase.bill_type, Purchase.is_interstate, Purchase.supplier_gstin,
        PurchaseItem.itc_eligible, PurchaseItem.gst_percent, PurchaseItem.taxable_value,
        PurchaseItem.total_cost, PurchaseItem.igst_amount.label("igst"),
        PurchaseItem.cgst_amount.label("cgst"), PurchaseItem.sgst_amount.label("sgst")
    ).join(PurchaseItem, PurchaseItem.purchase_id == Purchase.id).filter(
        Purchase.tenant_id == context.tenant_id, Purchase.status != "cancelled",
        Purchase.purchase_date >= from_date, Purchase.purchase_date <= to_date
    ).all()
    itc = Amounts()
    inward = {"inter_state": ZERO, "intra_state": ZERO}
    for row in purchases:
        if row.itc_eligible:
            itc.add(row)
            if row.gst_percent == 0:
                inward["inter_state" if row.is_interstate else "intra_state"] += row.taxable_value or ZERO
        elif row.bill_type == Purchase.BILL_NO_GST:
            supplier_state = state_code_for(row.supplier_gstin)
            inter = bool(store_state and supplier_state and supplier_state != store_state)
            inward["inter_state" if inter else "intra_state"] += row.total_cost or ZERO

    liability = {head: max(getattr(outward, head), ZERO) for head in HEADS}
    credit = {head: getattr(itc, head) for head in HEADS}
    payment, balance = estimate_set_off(liability, credit)
    return {
        "from_date": from_date, "to_date": to_date, "store_gstin": store.gstin,
        "outward_taxable": outward.as_dict(),
        "outward_nil_exempt": money(nil),
        "interstate_unregistered": [
            {"place_of_supply": pos, "taxable_value": money(a.taxable_value), "igst": money(a.igst)}
            for pos, a in sorted(interstate.items()) if not a.is_zero()],
        "itc_available": {head: money(credit[head]) for head in HEADS},
        "inward_exempt": {key: money(value) for key, value in inward.items()},
        "tax_payment": payment,
        "itc_balance": balance,
        "warnings": store_warnings(store),
    }

