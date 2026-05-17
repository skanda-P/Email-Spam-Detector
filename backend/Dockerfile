# ── Stage 1: dependency layer ─────────────────────────────
FROM python:3.11-slim AS deps

WORKDIR /app

# System deps needed to build some wheels (e.g. tokenizers Rust crate)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: runtime image ────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application code
COPY main.py .

# models/ is mounted at runtime via docker-compose volume —
# do NOT bake the .pt/.joblib files into the image.
RUN mkdir -p models

# Non-root user for safety
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# HuggingFace cache — keeps roberta-base download inside the container layer
ENV HF_HOME=/app/.cache/huggingface
RUN mkdir -p /app/.cache/huggingface

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000}"]
