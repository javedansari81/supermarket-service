"""
UPI QR codes for counter billing: the customer scans the code with any UPI app and the amount
is filled in. Payment goes straight to the store's UPI ID; nothing confirms it to the system,
so the cashier checks the payment on the store's UPI app before completing the bill.
"""
import base64
import io
import re
from decimal import Decimal
from urllib.parse import quote, urlencode

from PIL import Image
from reportlab.graphics.barcode.qrencoder import QRCode, QRErrorCorrectLevel

# UPI ID (VPA) such as mfmart@okicici or 9876543210@ybl
UPI_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$")
QR_MODULE_PX = 8
QR_QUIET_MODULES = 4


def upi_uri(upi_id: str, payee_name: str, amount: Decimal) -> str:
    """UPI payment link (NPCI upi://pay format) for a fixed amount in rupees"""
    params = {"pa": upi_id, "pn": payee_name, "am": f"{amount:.2f}", "cu": "INR"}
    return "upi://pay?" + urlencode(params, quote_via=quote)


def qr_png_base64(text: str) -> str:
    """QR code of the text as a base64 PNG"""
    code = QRCode(None, QRErrorCorrectLevel.M)
    code.addData(text)
    code.make()
    count = code.getModuleCount()
    size = count + 2 * QR_QUIET_MODULES
    image = Image.new("1", (size, size), 1)
    pixels = image.load()
    for row in range(count):
        for col in range(count):
            if code.isDark(row, col):
                pixels[col + QR_QUIET_MODULES, row + QR_QUIET_MODULES] = 0
    image = image.resize((size * QR_MODULE_PX, size * QR_MODULE_PX), Image.NEAREST)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()
