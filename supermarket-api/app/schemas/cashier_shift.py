"""
Cashier shift (cash drawer reconciliation) schemas
"""
from typing import Optional, List, Dict, Literal
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from app.core.shifts import DENOMINATIONS


def _required_text(v: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("This field is required")
    return v


class ShiftOpen(BaseModel):
    """Opening float: change money already in the drawer"""
    opening_float: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)


class CashMovementCreate(BaseModel):
    movement_type: Literal["in", "out"]
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    reason: str = Field(..., max_length=200)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        return _required_text(v)


class ShiftClose(BaseModel):
    """Note-by-note count, e.g. {"500": 3, "10": 4}"""
    denominations: Dict[int, int]
    note: Optional[str] = Field(None, max_length=500)

    @field_validator("denominations")
    @classmethod
    def validate_denominations(cls, v: Dict[int, int]) -> Dict[int, int]:
        for value, count in v.items():
            if value not in DENOMINATIONS:
                raise ValueError(f"₹{value} is not a counted note or coin")
            if count < 0 or count > 100000:
                raise ValueError(f"Count of ₹{value} must be between 0 and 100000")
        return v

    @field_validator("note")
    @classmethod
    def strip_note(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None


class ShiftApprove(BaseModel):
    note: str = Field(..., max_length=500)

    @field_validator("note")
    @classmethod
    def validate_note(cls, v: str) -> str:
        return _required_text(v)


class ShiftResponse(BaseModel):
    """Shift header; expected cash and difference are only set once the shift is closed"""
    id: int
    shift_no: str
    status: str
    opening_float: Decimal
    opened_by: Optional[int] = None
    opened_by_name: Optional[str] = None
    opened_at: datetime
    closed_by: Optional[int] = None
    closed_by_name: Optional[str] = None
    closed_at: Optional[datetime] = None
    counted_cash: Optional[Decimal] = None
    expected_cash: Optional[Decimal] = None
    difference: Optional[Decimal] = None
    close_note: Optional[str] = None
    approval_status: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_note: Optional[str] = None
    bill_count: int = 0

    model_config = {"from_attributes": True}


class CurrentShiftResponse(BaseModel):
    shift: Optional[ShiftResponse] = None
    shift_required: bool


class ShiftListResponse(BaseModel):
    items: List[ShiftResponse]
    total: int
    page: int
    page_size: int


class ShiftMovementResponse(BaseModel):
    id: int
    movement_type: str
    amount: Decimal
    reason: str
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ShiftCash(BaseModel):
    opening_float: Decimal
    cash_sales: Decimal
    cash_refunds: Decimal
    cash_voids: Decimal
    cash_in: Decimal
    cash_out: Decimal
    expected_cash: Decimal


class DenominationRow(BaseModel):
    value: int
    count: int
    amount: Decimal


class ShiftModeRow(BaseModel):
    """Per payment mode: collected on bills of the shift, refunded on its returns,
    voided during it, and net"""
    mode: str
    collected: Decimal
    refunded: Decimal
    voided: Decimal
    net: Decimal


class ShiftCashierRow(BaseModel):
    user_id: Optional[int] = None
    name: str
    bills: int
    amount: Decimal


class ShiftReport(ShiftResponse):
    """X report (open shift, interim) or Z report (closed shift, final)"""
    report_type: Literal["X", "Z"]
    cash: ShiftCash
    denominations: List[DenominationRow] = []
    modes: List[ShiftModeRow] = []
    cashiers: List[ShiftCashierRow] = []
    movements: List[ShiftMovementResponse] = []
    void_count: int = 0
    return_count: int = 0
    variance_limit: Decimal
