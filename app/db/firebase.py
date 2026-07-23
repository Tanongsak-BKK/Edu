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
                        {"projectId": project_id} if project_id else None,
                    )
                else:
                    print("[Firebase] No service account file found, attempting default application credentials...")
                    firebase_admin.initialize_app()
                    
            _db = firestore.Client(project=project_id, database="default") if project_id else firestore.Client(database="default")
            print("Firebase Admin / Firestore initialized")
        except Exception as e:
            print(f"Firebase init failed: {e}")
            _db = None
    else:
        print("Firebase Admin / Firestore not available (libraries not installed?)")

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
