"""Train and persist the adherence prior:  python -m app.train"""
from app.adherence import MODEL_PATH, train_and_save

if __name__ == "__main__":
    train_and_save()
    print(f"Saved {MODEL_PATH}")
