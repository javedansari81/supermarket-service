"""
Object storage helpers (Cloudflare R2 via the S3 API)
"""
from functools import lru_cache
from urllib.parse import quote
import boto3
from botocore.config import Config
from app.core.config import settings


def is_configured() -> bool:
    return all([settings.R2_ENDPOINT_URL, settings.R2_ACCESS_KEY_ID,
                settings.R2_SECRET_ACCESS_KEY, settings.R2_BUCKET_NAME])


@lru_cache
def get_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def upload_file(key: str, content: bytes, content_type: str) -> None:
    get_client().put_object(Bucket=settings.R2_BUCKET_NAME, Key=key,
                            Body=content, ContentType=content_type)


def delete_file(key: str) -> None:
    get_client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)


def presigned_url(key: str, file_name: str, content_type: str) -> str:
    """Temporary link that opens the file inline in the browser"""
    return get_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.R2_BUCKET_NAME,
            "Key": key,
            "ResponseContentType": content_type,
            "ResponseContentDisposition": f"inline; filename*=UTF-8''{quote(file_name)}",
        },
        ExpiresIn=settings.BILL_URL_EXPIRE_SECONDS,
    )
