
# WugaBot2

A web-based chat interface with advanced visualization capabilities and AI-powered responses.

## Features

- Real-time chat interface
- Support for multiple AI models
- File processing capabilities (PDF, DOC, DOCX, XLS, XLSX, TXT)
- Data visualization tools (charts, diagrams, drawings)
- Web search integration
- Mobile-responsive design

## Tech Stack

- Backend: Python/Flask
- Frontend: HTML, CSS, JavaScript
- AI Integration: Venice AI API
- Visualization: Matplotlib, SVG generation
- File Processing: PyPDF2, python-docx

## Environment Variables Required

- `VENICE_API_KEY`: Your Venice AI API key
- `LOG_LEVEL`: Logging level (default: INFO)

## Running the Application

The application runs on port 8080. To start:

1. Click the "Run" button in Replit
2. The server will start at `https://<repl-name>.<username>.repl.co`

## Project Structure

```
├── static/           # Static assets
├── templates/        # HTML templates
├── main.py          # Flask application
├── main.js          # Electron setup
└── manifest.json    # PWA manifest
```

## Features in Detail

### Chat Interface
- Real-time streaming responses
- Support for multiple AI models
- Temperature control
- System prompt configuration

### File Processing
- Support for multiple file formats
- Text extraction
- File size limit: 2MB

### Visualization
- Chart types: bar, line, pie
- Flowchart diagrams
- Simple drawings
- Error handling with visual feedback

## Mobile Support

The application is fully responsive and works on mobile devices with optimized UI elements and touch interactions.
