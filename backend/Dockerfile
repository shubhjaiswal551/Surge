# Surge Backend & Perception Tier Dockerfile
FROM python:3.12-slim

# Prevent Python from writing .pyc and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies for OpenCV and video decoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency specifications
COPY backend/requirements.txt requirements.txt

# Install PyTorch CPU and Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copy ML pipeline, backend source code, and demo video assets
COPY ml/ /app/ml/
COPY backend/ /app/backend/
COPY frontend/public/ /app/frontend/public/

ENV PORT=8000
EXPOSE 8000

# Start Uvicorn ASGI server with dynamic Render PORT support
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir backend"]
