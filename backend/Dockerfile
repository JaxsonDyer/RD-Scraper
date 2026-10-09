FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py storage.py insights.py worker.py ./
RUN useradd --create-home worker
USER worker
CMD ["python", "worker.py"]
