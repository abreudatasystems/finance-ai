import os
from minio import Minio
from minio.error import S3Error
from app.core.config import settings

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadminpassword")
BUCKET_NAME = "finance-documents"

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
        # Always store a local copy on disk for seamless preview/streaming
        try:
            safe_name = os.path.basename(object_name)
            local_path = os.path.join(UPLOAD_DIR, safe_name)
            with open(local_path, "wb") as f:
                f.write(file_data)
        except Exception as e:
            print(f"[Local Storage Error] {e}")

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
        return f"/api/v1/documents/files/{object_name}"

    def get_local_path(self, object_name: str) -> str:
        safe_name = os.path.basename(object_name)
        return os.path.join(UPLOAD_DIR, safe_name)

minio_service = MinIOStorageService()

