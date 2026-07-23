try:
    import firebase_admin
    from firebase_admin import credentials, auth as fb_auth
    from google.cloud import firestore
except ImportError:
    firebase_admin = None
    fb_auth = None
    firestore = None

import os
import json
import base64

_db = None

def init_firebase(project_id: str, cred_path: str = "./service-account.json"):
    global _db
    if firebase_admin is not None and firestore is not None:
        try:
            if not firebase_admin._apps:
                cred = None
                env_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
                env_b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_BASE64")
                
                if env_json:
                    cred_dict = json.loads(env_json)
                    cred = credentials.Certificate(cred_dict)
                elif env_b64:
                    decoded = base64.b64decode(env_b64).decode("utf-8")
                    cred_dict = json.loads(decoded)
                    cred = credentials.Certificate(cred_dict)
                elif os.path.exists(cred_path):
                    cred = credentials.Certificate(cred_path)

                if cred:
                    firebase_admin.initialize_app(
                        cred,
                        {
                            "projectId": project_id,
                            "storageBucket": f"{project_id}.firebasestorage.app" if project_id else None
                        } if project_id else None,
                    )
                else:
                    print("[Firebase] No service account file found, attempting default application credentials...")
                    firebase_admin.initialize_app(options={"storageBucket": f"{project_id}.firebasestorage.app"} if project_id else None)
                    
            _db = firestore.Client(project=project_id, database="default") if project_id else firestore.Client(database="default")
            print("Firebase Admin / Firestore initialized")
        except Exception as e:
            print(f"Firebase init failed: {e}")
            _db = None
    else:
        print("Firebase Admin / Firestore not available (libraries not installed?)")

def upload_file_to_storage(file_bytes: bytes, destination_path: str, content_type: str = "application/pdf") -> str:
    """ Uploads a file to Firebase Storage and returns public URL """
    if firebase_admin is None or not firebase_admin._apps:
        return ""
    try:
        from firebase_admin import storage
        # Try default bucket or fallback to appspot bucket
        try:
            bucket = storage.bucket()
        except Exception:
            bucket = storage.bucket(name=f"{os.getenv('FIREBASE_PROJECT_ID', 'edugen-ai-a0504')}.appspot.com")
            
        blob = bucket.blob(destination_path)
        blob.upload_from_string(file_bytes, content_type=content_type)
        try:
            blob.make_public()
            return blob.public_url
        except Exception:
            # Fallback to storage media link if make_public fails
            return f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{destination_path.replace('/', '%2F')}?alt=media"
    except Exception as e:
        print(f"[Firebase Storage Error] {e}")
        return ""

def get_firestore_db():
    return _db

def log_user_event(user_id: str, collection: str, data: dict) -> None:
    db = get_firestore_db()
    if db is None or firestore is None:
        return
    try:
        db.collection("users").document(user_id).collection(collection).add(
            {
                **data,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception as e:
        print(f"[history-log error] {e}")
