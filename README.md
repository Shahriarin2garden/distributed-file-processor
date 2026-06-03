# Distributed File Processing System

A production-ready distributed CSV/JSON processing system built with Ray, FastAPI, and Redis. Processes large files in parallel using Ray workers with fault tolerance and real-time progress tracking.

## 🚀 Features

- **Distributed Processing**: Parallel chunk processing using Ray workers
- **REST API**: FastAPI-powered async endpoints
- **Real-time Status**: Track job progress and errors via Redis
- **Fault Tolerance**: Automatic retry with exponential backoff
- **Scalable**: Easy horizontal scaling with Docker Compose
- **Operations**: Sum, Mean, and Filter operations on CSV columns

## 🏗️ Architecture

```
Client → FastAPI (8000)
         ├─ Upload files
         ├─ Start processing
         ├─ Check status
         └─ Get results
         
Redis (6379) ← Job metadata & results
Ray Head (8265) + 2x Ray Workers
Local Storage / S3
```

## 📋 Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for local development)
- 4GB+ RAM recommended

## 🚀 Quick Start

### 1. Clone & Setup

```bash
git clone <your-repo-url>
cd distributed-file-processor
cp .env.example .env
```

### 2. Start the System

```bash
docker-compose up --build
```

Services will be available at:
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Ray Dashboard**: http://localhost:8265
- **Redis**: localhost:6380

### 3. Test with Sample Data

Create a test CSV:
```bash
python -c "import pandas as pd; pd.DataFrame({'amount': range(1, 100001), 'category': ['A', 'B'] * 50000}).to_csv('test_data.csv', index=False)"
```

Upload and process:
```bash
# Upload file
curl -X POST "http://localhost:8000/api/v1/upload" \
  -F "file=@test_data.csv" \
  -F "operation=sum" \
  -F "column=amount" \
  -F "chunk_size_rows=25000"

# Response: {"job_id": "abc-123", "status": "uploaded", "estimated_chunks": 4}

# Start processing
curl -X POST "http://localhost:8000/api/v1/process/abc-123"

# Check status
curl "http://localhost:8000/api/v1/status/abc-123"

# Get result
curl "http://localhost:8000/api/v1/result/abc-123"
```

## 📁 Project Structure

```
distributed-file-processor/
├── app/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Settings
│   ├── models/job.py        # Pydantic models
│   ├── services/
│   │   ├── storage.py       # File operations
│   │   ├── chunker.py       # CSV splitting
│   │   ├── ray_tasks.py     # Distributed tasks
│   │   ├── ray_actor.py     # Result aggregation
│   │   └── orchestrator.py  # Job flow
│   ├── api/v1/endpoints/    # REST endpoints
│   └── utils/               # Redis, logging
├── tests/                   # Unit & integration tests
├── docker-compose.yml       # Multi-container setup
└── requirements.txt         # Python dependencies
```

## 🔧 Configuration

Edit `.env`:

```env
REDIS_URL=redis://redis:6379
RAY_ADDRESS=ray://ray-head:10001
STORAGE_TYPE=local
CHUNK_SIZE_ROWS=50000
MAX_CONCURRENT_TASKS=8
```

## 🧪 Running Tests

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v
```

## 📊 API Reference

### Upload File
```http
POST /api/v1/upload
Content-Type: multipart/form-data

Parameters:
- file: CSV file
- operation: "sum" | "mean" | "filter"
- column: string
- filter_value: string (optional, for filter operation)
- chunk_size_rows: int (default: 50000)
```

### Start Processing
```http
POST /api/v1/process/{job_id}
```

### Get Status
```http
GET /api/v1/status/{job_id}

Response:
{
  "job_id": "abc-123",
  "status": "processing",
  "progress": 45.0,
  "error_message": null
}
```

### Get Result
```http
GET /api/v1/result/{job_id}

Response:
{
  "job_id": "abc-123",
  "operation": "sum",
  "column": "amount",
  "result": 5000050000.0
}
```

## 🚀 Scaling

Increase Ray workers in `docker-compose.yml`:

```yaml
ray-worker:
  deploy:
    replicas: 4  # Change from 2 to 4
```

## 🔍 Monitoring

- **Ray Dashboard**: http://localhost:8265 - View active tasks, worker utilization
- **API Logs**: `docker-compose logs -f api`
- **Ray Logs**: `docker-compose logs -f ray-head`

## 🐛 Troubleshooting

**Connection refused errors**:
```bash
docker-compose down -v
docker-compose up --build
```

**Ray workers not connecting**:
- Check Ray dashboard at http://localhost:8265
- Ensure health checks pass: `docker-compose ps`

**Out of memory**:
- Reduce `CHUNK_SIZE_ROWS` in `.env`
- Reduce `MAX_CONCURRENT_TASKS`

## 🛣️ Roadmap

- [ ] S3 storage support
- [ ] JSON file processing
- [ ] Custom Python function execution
- [ ] Job scheduling (Celery)
- [ ] AWS deployment (ECS/EKS)
- [ ] Prometheus metrics

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📧 Contact

Your Name - your.email@example.com

Project Link: [https://github.com/yourusername/distributed-file-processor](https://github.com/yourusername/distributed-file-processor)
