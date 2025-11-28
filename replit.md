# WugaBot2

## Overview

WugaBot2 is a web-based chat interface that provides AI-powered conversational capabilities with advanced features including file processing, data visualization, and web search integration. The application serves as a privacy-focused chatbot platform that connects to external AI services (primarily Venice.ai) while offering a rich, mobile-responsive user experience.

The core purpose is to provide users with an accessible, feature-rich chat interface that supports multiple AI models, can process various document formats, generate visualizations, and integrate web search results into conversations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: Vanilla JavaScript, HTML5, CSS3

**Key Design Patterns**:
- **Module-based organization**: Character definitions and system prompts are separated into `characters.js` for maintainability
- **Event-driven UI**: Uses async/await patterns for API communication with real-time streaming support
- **Progressive Web App (PWA)**: Includes manifest.json for mobile app-like installation capabilities
- **Responsive Design**: Mobile-first approach with viewport optimization and touch-friendly controls

**Core Components**:
1. **Chat Interface** (`templates/index.html`, `static/script.js`): Main chat UI with message rendering, streaming response handling, and citation display
2. **Styling System** (`static/style.css`): Dark theme with CSS custom properties for theming, includes syntax highlighting integration
3. **Character System** (`static/characters.js`): Supports multiple conversation modes including multilingual assistants (English, German, Indonesian), specialized roles (Chart Analyst, Data Assistant, SAP Consultant), and content filtering options

**State Management**: Client-side state stored in global variables:
- `chatHistory`: Array storing conversation messages
- `currentStream`: Tracks active streaming responses
- `botContentBuffer`: Temporary buffer for assembling streamed content
- `lastCitations`: Stores web search citations for display

### Backend Architecture

**Technology Stack**: Python 3, Flask web framework

**Design Rationale**: Flask was chosen for its simplicity and lightweight nature, suitable for a chat interface that primarily proxies requests to external AI services rather than implementing complex business logic.

**Key Components**:

1. **Main Application** (`main.py`):
   - Flask server handling HTTP routing
   - Serves static files and templates
   - Proxies AI model requests to Venice.ai API
   - Implements logging with configurable levels

2. **File Processing Pipeline**:
   - **PDF Support**: PyPDF2 for text extraction
   - **Document Support**: python-docx for DOC/DOCX processing
   - **Spreadsheet Support**: Implied XLS/XLSX handling
   - **Plain Text**: Direct TXT file reading
   
   Rationale: Multiple file format support allows users to upload documents for context-aware conversations without requiring external conversion tools.

3. **AI Integration Layer**:
   - **Primary Provider**: Venice.ai API (OpenAI-compatible endpoints)
   - **Alternative Provider**: Google AI/Gemini support via `google_ai_handler.py`
   - **Streaming Architecture**: Server-Sent Events (SSE) for real-time response streaming
   - **Citation Handling**: Special parsing logic for web search results with [REF] tag processing

**API Design**:
- `/models`: Retrieves available AI models from Venice.ai
- `/image/models`: Returns available Venice image generation models (13 models with fallback)
- `/image/styles`: Fetches available image style presets from Venice API
- `/image/generate`: Generates images from text prompts with model/style/format/size options
- Chat completion endpoints use streaming responses for better UX
- RESTful design with JSON payloads

**Error Handling**: Comprehensive logging system with configurable log levels, try-catch blocks for API failures, graceful degradation when services are unavailable.

### Data Storage Solutions

**Current State**: No persistent storage implemented

**Session Management**: Ephemeral client-side state only - chat history exists only in browser memory and is lost on page refresh

**Rationale**: Aligns with privacy-first approach mentioned in Venice.ai integration - no user data storage reduces privacy concerns and infrastructure complexity

**Future Considerations**: The architecture could be extended with:
- Local storage for client-side chat persistence
- Optional database layer (Postgres with Drizzle ORM mentioned in notes) for user accounts and conversation history
- Vector database integration (references to "Vector Store Management API" in script.js suggest planned RAG functionality)

### Authentication and Authorization

**Current Implementation**: API key-based authentication for external services only

**External Service Auth**:
- Venice.ai: Bearer token (JWT format) stored in environment variable `VENICE_API_KEY`
- Google AI: API key stored in `GOOGLE_API_KEY` environment variable

**User Authentication**: None currently implemented - application is open access

**Rationale**: Simplified deployment model suitable for personal use or internal deployment. The absence of user authentication reduces complexity but limits multi-user scenarios.

### Cross-Platform Support

**Electron Integration** (`main.js`, `package.json`):
- Desktop application wrapper using Electron framework
- Loads the Replit-hosted web app in a native window
- Provides desktop installation option while maintaining web-first architecture

**Rationale**: Hybrid approach allows the same codebase to serve both web and desktop users without duplicating functionality. The Electron wrapper is minimal, delegating all functionality to the web application.

## External Dependencies

### AI Services

1. **Venice.ai API** (Primary)
   - **Purpose**: Privacy-first AI model provider with OpenAI-compatible API
   - **Features Used**: Chat completions, model listing, streaming responses, web search with citations, image generation
   - **Authentication**: Bearer token (environment variable: `VENICE_API_KEY`)
   - **Endpoints**: 
     - `https://api.venice.ai/api/v1/chat/completions`
     - `https://api.venice.ai/api/v1/models`
     - `https://api.venice.ai/api/v1/image/generate`
     - `https://api.venice.ai/api/v1/image/styles`
   - **Special Features**: Citation system with [REF] tags, `venice_parameters` for metadata, image generation with 13+ models
   - **Rationale**: Chosen for privacy-focused approach, open-source model support, and uncensored responses

2. **Google AI (Gemini)** (Alternative)
   - **Purpose**: Backup AI provider with vision capabilities
   - **Integration**: Via `google.genai` Python SDK
   - **Authentication**: API key (environment variable: `GOOGLE_API_KEY`)
   - **Models**: gemini-pro and variants
   - **Rationale**: Provides vision model capabilities for chart/image analysis when Venice.ai lacks this feature

### Frontend Libraries

1. **Prism.js** (CDN)
   - **Purpose**: Syntax highlighting for code blocks in chat responses
   - **Version**: 1.24.1
   - **Components**: Core + JavaScript language support

2. **Font Awesome** (Implied)
   - **Purpose**: Icon system for UI controls (settings, trash, info icons)
   - **Integration**: Via `<i class="fas fa-*">` tags in HTML

### Backend Libraries

1. **Flask**
   - **Purpose**: Web framework for HTTP server
   - **Rationale**: Lightweight, simple routing, suitable for API proxy pattern

2. **OpenAI Python SDK**
   - **Purpose**: Client library for Venice.ai (OpenAI-compatible)
   - **Usage**: Simplified API interaction with type safety

3. **File Processing**:
   - **PyPDF2**: PDF text extraction
   - **python-docx**: Word document processing
   - **Built-in io module**: File handling and buffering

4. **Requests**
   - **Purpose**: HTTP client for API calls
   - **Usage**: Model listing and direct API communication

### Desktop Framework

1. **Electron** (v34.2.0)
   - **Purpose**: Cross-platform desktop application wrapper
   - **Dependencies**: Full Electron stack with ~50+ npm packages
   - **Rationale**: Enables desktop installation while maintaining web-first architecture

### Development Environment

**Replit Platform**:
- Hosted deployment environment
- Port 8080 standard deployment
- Environment variable management for secrets
- No local build process required

### Visualization Libraries (Referenced)

**Matplotlib** (Mentioned in README):
- **Purpose**: Data visualization and chart generation
- **Integration**: Server-side chart generation via Python
- **Note**: Not visible in provided code but referenced in feature list

**SVG Generation** (Mentioned):
- **Purpose**: Custom diagram and drawing generation
- **Integration**: Via special tags in chat responses (`<generate_visualization>`)