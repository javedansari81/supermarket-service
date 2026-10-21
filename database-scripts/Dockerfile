# App Platform pre-deploy job: applies pending SQL scripts before each release.
# Build context is the repository root.
FROM python:3.11-slim

WORKDIR /app
RUN pip install --no-cache-dir psycopg2-binary==2.9.9 python-dotenv==1.0.0
COPY database-scripts/ database-scripts/

CMD ["python", "database-scripts/deploy.py", "migrate"]
