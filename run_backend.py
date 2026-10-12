import os
import uvicorn

if __name__ == "__main__":
    # Support container/production environments while preserving local development defaults
    port = int(os.getenv("PORT", "8000"))
    is_prod = bool(os.getenv("PORT") or os.getenv("ENVIRONMENT") == "production" or os.getenv("ENV") == "production")
    host = os.getenv("HOST", "0.0.0.0" if is_prod else "127.0.0.1")
    reload = os.getenv("RELOAD", "false" if is_prod else "true").lower() == "true"

    print(f"Starting SECURECAM Computer Vision Backend on http://{host}:{port} (reload={reload})...")
    uvicorn.run("backend.app.main:app", host=host, port=port, reload=reload)

