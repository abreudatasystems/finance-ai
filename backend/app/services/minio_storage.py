import os
from minio import Minio
from minio.error import S3Error
from app.core.config import settings

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadminpassword")
BUCKET_NAME = "finance-documents"

class MinIOStorageService:
    def __init__(self):
        self.client = None
        try:
            self.client = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=False
            )
            # Create bucket if not exists
            if not self.client.bucket_exists(BUCKET_NAME):
                self.client.make_bucket(BUCKET_NAME)
        except Exception as e:
            print(f"[MinIO Warning] Operating in local fallback mode: {e}")

    def upload_file(self, object_name: str, file_data: bytes, content_type: str = "application/pdf") -> str:
        if self.client:
            try:
                import io
                data_stream = io.BytesIO(file_data)
                self.client.put_object(
                    BUCKET_NAME,
                    object_name,
                    data_stream,
                    length=len(file_data),
                    content_type=content_type
                )
                return f"http://{MINIO_ENDPOINT}/{BUCKET_NAME}/{object_name}"
            except Exception as e:
                print(f"[MinIO Storage Error] {e}")
        return f"http://localhost:9000/finance-documents/{object_name}"

minio_service = MinIOStorageService()
