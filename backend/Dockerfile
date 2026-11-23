# FastAPI backend. Build context is ./backend. Configuration comes from environment variables (see docker-compose.yml);
# no .env file is baked into the image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# The modules import each other by bare name (from config import settings), so run from the backend directory.
WORKDIR /app/backend

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN useradd --system --uid 10001 appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

# One process only: a background task emails month-end statements, so extra workers would send duplicates.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
