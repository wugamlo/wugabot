# WugaBot Technical Documentation

## Complete Implementation Guide for AI Chat Application

**Version:** 1.0  
**Last Updated:** February 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Backend Implementation (main.py)](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Feature Implementations](#feature-implementations)
8. [Data Structures](#data-structures)
9. [External Integrations](#external-integrations)
10. [UI Components](#ui-components)
11. [Character System](#character-system)
12. [Replication Guide](#replication-guide)

---

## Overview

WugaBot is a full-featured AI chat application that interfaces with the Venice.ai API. It provides:

- **Streaming Chat**: Real-time AI responses using Server-Sent Events (SSE)
- **Deep Research Mode**: Multi-model synthesis for comprehensive answers
- **RAG Integration**: Retrieval-Augmented Generation using external vector store
- **Web Search**: Real-time web search with citation display
- **Vision Capabilities**: Image analysis with vision-capable models
- **File Processing**: Extract and analyze text from PDF, DOCX, TXT, and Excel files
- **Image Generation**: AI-powered image creation with multiple models and styles
- **Visualization Creation**: Charts, diagrams, and drawings
- **Character Personas**: Pre-defined system prompts for different use cases
- **Settings Persistence**: LocalStorage-based settings and chat history management
- **PWA Support**: Progressive Web App capabilities for mobile installation

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Browser)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐│
│  │  index.html  │ │  style.css   │ │      script.js           ││
│  │  (Template)  │ │  (Styling)   │ │  (App Logic/State)       ││
│  └──────────────┘ └──────────────┘ └──────────────────────────┘│
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐ │
│  │                    LocalStorage                            │ │
│  │  - chatHistory, systemPrompt, temperature, maxTokens       │ │
│  │  - ragEnabled, knowledgeBase, expertModeEnabled            │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP/SSE
┌──────────────────────────────┴──────────────────────────────────┐
│                      Backend (Flask)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     main.py                               │  │
│  │  Endpoints: /chat/stream, /chat/expert, /models,         │  │
│  │            /process_file, /image/generate, /visualize    │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Venice.ai     │  │  Vector Store   │  │   Web Search    │
│   API           │  │  (RAG)          │  │   (via Venice)  │
│                 │  │                 │  │                 │
│ - Chat Models   │  │ wugamlo-vector- │  │ Citations &     │
│ - Image Models  │  │ store.replit.app│  │ Results         │
│ - Styles API    │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Request Flow

1. User enters message in frontend
2. Frontend builds message payload with context
3. If RAG enabled: Query vector store, augment prompt
4. If Expert Mode: Send to `/chat/expert` for multi-model synthesis
5. If Normal Mode: Send to `/chat/stream` for streaming response
6. Backend proxies to Venice.ai API
7. Response streams back via SSE
8. Frontend parses chunks, updates UI, saves to history

---

## Technology Stack

### Backend
- **Framework**: Flask (Python 3.11)
- **AI Client**: OpenAI SDK (for Venice.ai compatibility)
- **File Processing**: PyPDF2, python-docx, openpyxl
- **Visualization**: Matplotlib, Pillow (PIL)
- **HTTP Client**: requests
- **Concurrency**: concurrent.futures (ThreadPoolExecutor)

### Frontend
- **Framework**: Vanilla JavaScript (ES6 Modules)
- **Styling**: CSS3 with CSS Variables
- **Syntax Highlighting**: Prism.js
- **Icons**: Font Awesome 6
- **State Management**: LocalStorage API

### External Services
- **AI Provider**: Venice.ai API (https://api.venice.ai/api/v1/)
- **Vector Store**: wugamlo-vector-store.replit.app

---

## Backend Implementation

### File: main.py

#### Core Dependencies

```python
from flask import Flask, Response, render_template, request
from openai import OpenAI
import os
import json
import PyPDF2
import docx
import io
import logging
import requests
import concurrent.futures
```

#### Logging Configuration

```python
log_level = os.getenv('LOG_LEVEL', 'INFO')
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
```

#### Environment Variables Required

| Variable | Description |
|----------|-------------|
| `VENICE_API_KEY` | API key for Venice.ai |
| `LOG_LEVEL` | Optional: Logging level (default: INFO) |

---

## API Endpoints Reference

### GET /models

Retrieves available AI models from Venice.ai.

**Response:**
```json
{
  "models": [
    {
      "id": "mistral-31-24b",
      "model_spec": {
        "offline": false,
        "availableContextTokens": 128000,
        "capabilities": {
          "supportsReasoning": false,
          "supportsWebSearch": true,
          "supportsVision": false,
          "optimizedForCode": false,
          "supportsFunctionCalling": true
        },
        "constraints": {
          "temperature": { "default": 0.7 }
        },
        "pricing": {
          "input": { "diem": 0.15 },
          "output": { "diem": 0.6 },
          "cache_input": { "usd": 0.025 }
        }
      }
    }
  ]
}
```

### POST /chat/stream

Handles streaming chat completions.

**Request Body:**
```json
{
  "messages": [
    { "role": "system", "content": "System prompt..." },
    { "role": "user", "content": "User message" }
  ],
  "model": "mistral-31-24b",
  "max_completion_tokens": 4000,
  "temperature": 0.7,
  "web_search": "on"  // Optional: enables web search
}
```

**Response:** Server-Sent Events stream

```
data: {"content": "Hello"}
data: {"content": ", how"}
data: {"content": " can I help?"}
data: {"venice_parameters": {"web_search_citations": [{"title": "...", "url": "..."}]}}
data: [DONE]
```

**Implementation Details:**

```python
@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    data = request.json
    search_enabled = data.get('web_search', False)
    messages = data.get('messages', [])
    max_completion_tokens = data.get('max_completion_tokens', 8000)
    temperature = data.get('temperature', 0.7)

    def generate(model, messages, temperature, max_completion_tokens, search_enabled):
        payload = {
            "model": model,
            "messages": messages,
            "venice_parameters": {
                "include_venice_system_prompt": False
            },
            "max_completion_tokens": max_completion_tokens,
            "temperature": temperature,
            "stream": True
        }

        if search_enabled == "on":
            payload["venice_parameters"]["enable_web_search"] = "on"
            payload["venice_parameters"]["enable_web_citations"] = True
            payload["venice_parameters"]["include_search_results_in_stream"] = True

        response = requests.post(
            "https://api.venice.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
                "Content-Type": "application/json"
            },
            json=payload,
            stream=True
        )

        for line in response.iter_lines():
            # Process and yield SSE chunks
            ...

    return Response(generate(...), mimetype='text/event-stream')
```

### POST /chat/expert

Deep Research Mode - queries multiple models and synthesizes responses.

**Request Body:**
```json
{
  "messages": [...],
  "candidate_models": ["model1", "model2", "model3"],
  "synthesis_model": "mistral-31-24b",
  "show_candidates": true,
  "max_completion_tokens": 8000,
  "temperature": 0.7,
  "candidate_capabilities": {
    "model1": { "supportsWebSearch": true }
  },
  "synthesis_capabilities": {
    "mistral-31-24b": { "supportsWebSearch": true }
  }
}
```

**Response:**
```json
{
  "synthesized_response": "Comprehensive answer...",
  "synthesis_model": "mistral-31-24b",
  "candidate_count": 3,
  "candidates": [  // Only if show_candidates is true
    { "model": "model1", "content": "Response 1..." },
    { "model": "model2", "content": "Response 2..." }
  ]
}
```

**Implementation Details:**

```python
@app.route('/chat/expert', methods=['POST'])
def chat_expert():
    # Parallel execution of candidate queries
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_model = {
            executor.submit(get_candidate_response, model): model 
            for model in candidate_models
        }
        
        for future in concurrent.futures.as_completed(future_to_model, timeout=180):
            result = future.result(timeout=120)
            candidate_responses.append(result)
    
    # Synthesis prompt construction
    synthesis_prompt = f"""You are tasked with synthesizing multiple AI responses...
    
    Candidate Responses:
    {candidates_text}
    
    Please provide a synthesized response..."""
    
    # Lower temperature (0.3) for consistent synthesis
```

### POST /process_file

Processes uploaded files and extracts text content.

**Supported Formats:**
- `.txt` - Plain text
- `.pdf` - PDF documents
- `.doc/.docx` - Word documents
- `.xls/.xlsx` - Excel spreadsheets

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "text": "Extracted text content...",
  "type": "pdf"
}
```

**Implementation:**

```python
def extract_text_from_file(file_data, file_type):
    if file_type == 'txt':
        return file_data.decode('utf-8')
    elif file_type == 'pdf':
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_data))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text
    elif file_type in ['doc', 'docx']:
        doc = docx.Document(io.BytesIO(file_data))
        return "\n".join([para.text for para in doc.paragraphs])
    elif file_type in ['xls', 'xlsx']:
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(file_data))
        text = ""
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                text += "\t".join([str(cell) if cell else "" for cell in row]) + "\n"
        return text
```

### GET /image/models

Retrieves available image generation models.

**Response:**
```json
{
  "models": [
    {
      "id": "fluently-xl",
      "model_spec": {
        "constraints": {
          "steps": { "default": 20 }
        }
      }
    }
  ]
}
```

**Known Image Models:**
- fluently-xl
- flux-dev
- flux-dev-uncensored
- hidream
- playground-v2.5
- dreamshaper
- stable-diffusion-3.5-large
- venice-sd35
- nano-banana-pro
- qwen-image

### GET /image/styles

Retrieves available image styles.

**Response:**
```json
{
  "styles": [...],
  "formats": ["webp", "png", "jpeg"]
}
```

### POST /image/generate

Generates images using Venice.ai image models.

**Request Body (Standard Models):**
```json
{
  "prompt": "A beautiful sunset over mountains",
  "model": "fluently-xl",
  "style_preset": "style-id",
  "format": "webp",
  "width": 1024,
  "height": 1024,
  "negative_prompt": "blurry, low quality",
  "safe_mode": false,
  "hide_watermark": true
}
```

**Request Body (nano-banana-pro):**
```json
{
  "prompt": "...",
  "model": "nano-banana-pro",
  "aspect_ratio": "1:1",
  "resolution": "1K"
}
```

**Response:**
```json
{
  "images": [
    {
      "data": "data:image/webp;base64,...",
      "format": "webp"
    }
  ],
  "id": "generation-id",
  "timing": {}
}
```

### POST /visualize

Generates charts, diagrams, or drawings.

**Request Body:**
```json
{
  "type": "chart",
  "data": {
    "chart_type": "bar",
    "title": "Sales Data",
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "values": [100, 150, 200, 175]
  }
}
```

**Supported Types:**
- `chart`: Bar, line, pie charts using Matplotlib
- `diagram`: Flowcharts using Matplotlib
- `drawing`: Simple drawings using PIL

**Response:**
```json
{
  "image": "data:image/png;base64,...",
  "type": "chart"
}
```

---

## Feature Implementations

### 1. Streaming Chat

The streaming implementation uses Server-Sent Events (SSE):

**Backend (generator function):**
```python
def generate(model, messages, ...):
    response = requests.post(
        "https://api.venice.ai/api/v1/chat/completions",
        json=payload,
        stream=True
    )
    
    for line in response.iter_lines():
        if not line:
            continue
        line = line.decode('utf-8')
        if not line.startswith('data: '):
            continue
        data = line[6:]
        if data == '[DONE]':
            yield "data: [DONE]\n\n"
            break
        
        json_data = json.loads(data)
        
        # Handle content
        if 'choices' in json_data and json_data['choices'][0].get('delta', {}).get('content'):
            yield f"data: {json.dumps({'content': delta['content']})}\n\n"
        
        # Handle citations
        if 'venice_parameters' in json_data:
            if 'web_search_citations' in json_data['venice_parameters']:
                citations_chunk = {
                    "venice_parameters": {
                        "web_search_citations": cleaned_citations
                    }
                }
                yield f"data: {json.dumps(citations_chunk)}\n\n"
        
        # Handle reasoning content (for reasoning models)
        if 'reasoning_content' in json_data:
            yield f"data: {json.dumps({'reasoning_content': json_data['reasoning_content']})}\n\n"
```

**Frontend (consumer):**
```javascript
async function fetchChatResponse(messages, botMessage) {
    const response = await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(5).trim();
            
            if (data === '[DONE]') {
                // Finalize response
                botMessage.innerHTML = formatContent(botContentBuffer);
                return;
            }

            const parsed = JSON.parse(data);
            
            if (parsed.content) {
                botContentBuffer += parsed.content;
            }
            
            if (parsed.venice_parameters?.web_search_citations) {
                lastCitations = parsed.venice_parameters.web_search_citations;
            }
            
            if (parsed.reasoning_content) {
                reasoningContent += parsed.reasoning_content;
            }
        }
    }
}
```

### 2. Deep Research Mode (Multi-Model Synthesis)

**Workflow:**
1. User selects multiple candidate models
2. User selects a synthesis model
3. All candidates receive the same query in parallel
4. Successful responses are collected
5. Synthesis model receives all responses with synthesis instructions
6. Final synthesized answer is returned

**Synthesis Prompt Template:**
```
You are tasked with synthesizing multiple AI responses into a single, comprehensive answer.

Please create a synthesized response that:
1. Combines the best insights from all responses
2. Maintains consistency and coherence
3. Removes redundancy while preserving important details
4. Provides a balanced and well-structured answer

Candidate Responses:
[Response from Model 1]
[Response from Model 2]
...

Please provide a synthesized response that incorporates the strengths of each candidate.
```

**Key Implementation Details:**
- ThreadPoolExecutor with max 5 workers
- 120-second timeout per candidate
- 180-second overall timeout
- Synthesis uses temperature 0.3 for consistency
- Web search enabled for capable models

### 3. RAG Integration

**Vector Store API (External):**
- Base URL: `https://wugamlo-vector-store.replit.app`
- Endpoints:
  - `GET /api/collections` - List all collections
  - `POST /api/collections/{name}/search` - Search collection

**Frontend Implementation:**
```javascript
async function fetchCollections() {
    const response = await fetch('https://wugamlo-vector-store.replit.app/api/collections');
    const data = await response.json();
    return data.collections;
}

async function searchCollection(collectionName, query, limit = 5) {
    const response = await fetch(
        `https://wugamlo-vector-store.replit.app/api/collections/${collectionName}/search`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit })
        }
    );
    return (await response.json()).results;
}
```

**Integration in Chat:**
```javascript
async function startStream() {
    // Check if RAG is enabled
    const ragEnabled = document.getElementById('ragEnabled').checked;
    const knowledgeBase = document.getElementById('knowledgeBase').value;

    if (ragEnabled && knowledgeBase) {
        // Search the knowledge base
        const ragResults = await searchCollection(knowledgeBase, message, 5);
        
        if (ragResults && ragResults.length > 0) {
            // Augment the message with RAG context
            const ragContext = ragResults.map(r => r.text).join('\n\n');
            message = `Context from knowledge base:\n${ragContext}\n\nUser question: ${message}`;
        }
    }
}
```

### 4. Web Search with Citations

**Enabling Web Search:**
```javascript
function toggleWebSearch(button) {
    const isActive = button.classList.toggle('active');
    // Visual feedback
    button.style.background = isActive ? 'var(--secondary-color)' : '';
}
```

**Backend Venice Parameters:**
```python
if search_enabled == "on":
    payload["venice_parameters"]["enable_web_search"] = "on"
    payload["venice_parameters"]["enable_web_citations"] = True
    payload["venice_parameters"]["include_search_results_in_stream"] = True
```

**Citation Format:**
```javascript
function formatCitations(citations) {
    if (!citations || citations.length === 0) return '';
    
    let html = `
        <div class="citations-container">
            <div class="citations-header" onclick="toggleCitations(event)">
                <span>Sources (${citations.length})</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="citations-list" style="display: none;">
    `;
    
    citations.forEach((citation, index) => {
        html += `
            <div class="citation-item">
                <span class="citation-number">[${index + 1}]</span>
                <a href="${citation.url}" target="_blank" rel="noopener">${citation.title}</a>
            </div>
        `;
    });
    
    html += '</div></div>';
    return html;
}
```

### 5. Vision Capabilities

**Image Upload Handling:**
```javascript
function handleImageUpload(input) {
    if (input.files.length > 0) {
        const modelSelect = document.getElementById('modelSelect');
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];

        // Check if current model supports vision
        if (selectedOption.dataset.supportsVision !== 'true') {
            alert('Please select a vision-capable model to analyze images');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Image = event.target.result;
            imagePreview.innerHTML = `<img src="${base64Image}" .../>`;
        };
        reader.readAsDataURL(input.files[0]);
    }
}
```

**Sending Images to API:**
```javascript
// Image as message content
if (base64Image) {
    messages.push({
        role: 'user',
        content: [{ 
            type: 'image_url', 
            image_url: { url: base64Image } 
        }]
    });
}
```

**Image Resizing (optimization):**
```javascript
function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => { img.src = e.target.result; };

        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Maintain aspect ratio
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolve, 'image/jpeg', 0.7);
        };

        reader.readAsDataURL(file);
    });
}
```

### 6. Image Generation

**Frontend Panel Controls:**
- Model selection (from /image/models)
- Style selection (from /image/styles)
- Format (webp, png, jpeg)
- Size/Aspect Ratio/Resolution (model-dependent)
- Prompt and Negative Prompt

**Generation Function:**
```javascript
async function generateImage() {
    const model = document.getElementById('imageModel').value;
    const style = document.getElementById('imageStyle').value;
    const format = document.getElementById('imageFormat').value;
    const prompt = document.getElementById('imagePrompt').value;
    const negativePrompt = document.getElementById('negativePrompt').value;

    const payload = {
        prompt: prompt,
        model: model,
        format: format,
        negative_prompt: negativePrompt
    };

    // Model-specific parameters
    if (model === 'nano-banana-pro') {
        payload.aspect_ratio = document.getElementById('imageAspectRatio').value;
        payload.resolution = document.getElementById('imageResolution').value;
    } else {
        const [width, height] = document.getElementById('imageSize').value.split('x');
        payload.width = parseInt(width);
        payload.height = parseInt(height);
    }

    if (style) payload.style_preset = style;

    const response = await fetch('/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    // Display generated image in chat
    if (result.images && result.images.length > 0) {
        appendMessage(`<img src="${result.images[0].data}" />`, 'assistant');
    }
}
```

### 7. Visualization Generation

**Visualization Tags in Responses:**
```
<generate_visualization type="chart" data='{"chart_type":"bar","title":"Sales","labels":["Q1","Q2"],"values":[100,150]}'></generate_visualization>
```

**Chart Generation (Backend):**
```python
if visualization_type == 'chart':
    import matplotlib.pyplot as plt
    import matplotlib
    matplotlib.use('Agg')
    
    chart_type = viz_data.get('chart_type', 'bar')
    title = viz_data.get('title', 'Chart')
    labels = viz_data.get('labels', [])
    values = viz_data.get('values', [])
    
    plt.figure(figsize=(10, 6))
    
    if chart_type == 'bar':
        plt.bar(labels, values, color='#3498db')
    elif chart_type == 'line':
        plt.plot(labels, values, marker='o', color='#3498db')
    elif chart_type == 'pie':
        plt.pie(values, labels=labels, autopct='%1.1f%%')
    
    plt.title(title)
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100)
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    return json.dumps({
        'image': f'data:image/png;base64,{img_str}',
        'type': 'chart'
    })
```

**Diagram Generation:**
```python
if visualization_type == 'diagram':
    diagram_type = viz_data.get('diagram_type', 'flowchart')
    elements = viz_data.get('elements', [])
    
    plt.figure(figsize=(12, 8))
    ax = plt.gca()
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    
    # Draw flowchart boxes and arrows
    y_pos = 8
    for i, element in enumerate(elements):
        # Draw box
        rect = plt.Rectangle((3, y_pos - 0.5), 4, 1, 
                            fill=True, facecolor='lightblue', edgecolor='black')
        ax.add_patch(rect)
        ax.text(5, y_pos, element.get('text', ''), ha='center', va='center')
        
        # Draw arrow to next element
        if i < len(elements) - 1:
            ax.annotate('', xy=(5, y_pos - 1.5), xytext=(5, y_pos - 0.5),
                       arrowprops=dict(arrowstyle='->', color='black'))
        
        y_pos -= 2
```

**Drawing Generation (PIL):**
```python
if visualization_type == 'drawing':
    from PIL import Image, ImageDraw, ImageFont
    
    img = Image.new('RGB', (500, 500), color='white')
    draw = ImageDraw.Draw(img)
    
    description = viz_data.get('description', '')
    
    if 'cat' in description.lower():
        # Draw cat face with ears, eyes, whiskers
        draw.ellipse((100, 100, 400, 400), outline='black', width=3)
        # ... detailed cat drawing
    elif 'circle' in description.lower():
        draw.ellipse((100, 100, 400, 400), outline='black', width=3)
    # ... other shapes
    
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode('utf-8')
```

---

## Data Structures

### Chat History (LocalStorage)

```javascript
// Stored as JSON string in localStorage.chatHistory
[
    { "role": "system", "content": "System prompt..." },
    { "role": "user", "content": "User message" },
    { "role": "assistant", "content": "AI response" }
]
```

### Model Information Structure

```javascript
{
    id: "model-id",
    model_spec: {
        offline: false,
        availableContextTokens: 128000,
        capabilities: {
            supportsReasoning: boolean,
            supportsWebSearch: boolean,
            supportsVision: boolean,
            optimizedForCode: boolean,
            supportsFunctionCalling: boolean
        },
        constraints: {
            temperature: { default: 0.7 }
        },
        pricing: {
            input: { diem: number },
            output: { diem: number },
            cache_input: { usd: number }
        }
    }
}
```

### Settings (LocalStorage Keys)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `systemPrompt` | string | WugaBot prompt | System prompt text |
| `maxTokens` | number | 4000 | Max completion tokens |
| `temperature` | number | 0.7 | Generation temperature |
| `ragEnabled` | boolean | false | RAG toggle state |
| `knowledgeBase` | string | "" | Selected knowledge base |
| `expertModeEnabled` | boolean | false | Deep research toggle |
| `candidateModels` | JSON array | [] | Selected candidate models |
| `synthesisModel` | string | "mistral-31-24b" | Synthesis model |
| `showCandidates` | boolean | false | Show individual responses |
| `chatHistory` | JSON array | [] | Full chat history |

---

## External Integrations

### Venice.ai API

**Base URL:** `https://api.venice.ai/api/v1`

**Endpoints Used:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/models` | GET | List available models |
| `/models?type=image` | GET | List image models |
| `/chat/completions` | POST | Generate chat responses |
| `/image/generate` | POST | Generate images |
| `/image/styles` | GET | List image styles |

**Authentication:**
```
Authorization: Bearer {VENICE_API_KEY}
Content-Type: application/json
```

**Venice Parameters:**
```json
{
    "include_venice_system_prompt": false,
    "enable_web_search": "on",
    "enable_web_citations": true,
    "include_search_results_in_stream": true
}
```

### Vector Store API

**Base URL:** `https://wugamlo-vector-store.replit.app`

**Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/collections` | GET | List collections |
| `/api/collections/{name}/search` | POST | Search collection |

**Search Request:**
```json
{
    "query": "search text",
    "limit": 5
}
```

**Search Response:**
```json
{
    "results": [
        { "text": "...", "score": 0.95 },
        { "text": "...", "score": 0.87 }
    ]
}
```

---

## UI Components

### HTML Structure (index.html)

```html
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <link rel="manifest" href="/manifest.json">
    <title>WugaBot</title>
</head>
<body>
    <!-- Header with model selector -->
    <div class="header">
        <div class="header-left">
            <button id="settingsToggle"><i class="fas fa-cog"></i></button>
            <div class="header-title">WugaBot</div>
        </div>
        <div class="header-center">
            <select id="headerModelSelect"></select>
            <button id="modelInfoButton"><i class="fas fa-info-circle"></i></button>
        </div>
        <div class="header-right">
            <button id="headerClearChat"><i class="fas fa-trash"></i></button>
        </div>
    </div>

    <div class="container">
        <!-- Settings Panel -->
        <div class="settings-panel">
            <!-- Model, Character, Text Size, Max Tokens, Temperature -->
            <!-- RAG Toggle and Knowledge Base selector -->
            <!-- System Prompt textarea -->
        </div>

        <!-- Chat Box -->
        <div class="chat-box" id="chatBox"></div>

        <!-- Input Area -->
        <div class="input-area">
            <input type="file" id="galleryInput" accept="image/*">
            <input type="file" id="fileInput" accept=".txt,.pdf,.doc,.docx,.xls,.xlsx">
            
            <div class="input-row">
                <button id="attachmentButton">+</button>
                <textarea id="userInput"></textarea>
                <button id="sendButton"><i class="fas fa-paper-plane"></i></button>
            </div>
            
            <div class="toggle-bar">
                <button id="searchEnabled">Search</button>
                <button id="deepResearchButton">Research</button>
                <button id="composerButton">Compose</button>
            </div>
        </div>

        <!-- Prompt Composer Panel -->
        <div class="prompt-composer">
            <!-- Instructions, Format, Context, Examples, Warnings fields -->
            <!-- Debug Tools -->
        </div>

        <!-- Deep Research Panel -->
        <div class="deep-research-panel">
            <!-- Candidate model checkboxes -->
            <!-- Synthesis model selector -->
            <!-- Show candidates toggle -->
        </div>

        <!-- Image Generation Panel -->
        <div class="image-gen-panel hidden">
            <!-- Model, Style, Format, Size selectors -->
            <!-- Prompt and Negative Prompt -->
        </div>

        <!-- Model Info Popup -->
        <div id="modelInfoPopup" class="model-info-popup hidden">
            <table id="modelInfoTable">
                <!-- Model capabilities and pricing table -->
            </table>
        </div>
    </div>
</body>
</html>
```

### CSS Theme Variables

```css
:root {
    --primary-color: #2c3e50;     /* Buttons */
    --secondary-color: #3498db;   /* Accent */
    --error-color: #e74c3c;       /* Errors */
    --loading-color: #bdc3c7;     /* Loading indicators */
    --background-color: #121212;  /* Main background */
    --text-color: #ffffff;        /* Text */
    --code-bg: #1a1a1a;          /* Code blocks */
    --inline-code-bg: #444444;   /* Inline code */
}
```

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.message.user` | User message bubble (right-aligned, blue) |
| `.message.assistant` | AI message bubble (left-aligned, light gray) |
| `.message.error` | Error message (centered, red) |
| `.settings-panel` | Slide-out settings sidebar |
| `.toggle-pill` | Toggle buttons for features |
| `.toggle-pill.active` | Active toggle state |
| `.citations-container` | Web search citations container |
| `.reasoning-content` | Reasoning model thinking display |
| `.research-log` | Deep research progress log |

---

## Character System

### File: static/characters.js

**Character Options:**
```javascript
export const characterOptions = [
    { value: "en", label: "English - Assistant (Default)" },
    { value: "de", label: "Deutsch - Assistent" },
    { value: "id", label: "Bahasa - Asisten" },
    { value: "ex", label: "Explicit Content" },
    { value: "ca", label: "Chart Analyst" },
    { value: "cs", label: "Content Summarizer" },
    { value: "da", label: "Data Assistant" },
    { value: "sa", label: "SAP Consultant" }
];
```

**System Prompts:**

| Key | Description |
|-----|-------------|
| `en` | Default helpful assistant in English |
| `de` | German language assistant |
| `id` | Indonesian language assistant |
| `ex` | Uncensored content mode |
| `ca` | Technical chart/financial analyst |
| `cs` | Comprehensive content summarizer |
| `da` | Data explanation specialist |
| `va` | Visualization-capable assistant |
| `sa` | SAP systems consultant |

**Character Selection:**
```javascript
characterSelect.addEventListener('change', function() {
    const selectedValue = this.value;
    if (selectedValue && systemPrompts[selectedValue]) {
        document.getElementById('systemPrompt').value = systemPrompts[selectedValue];
        saveSettings();
    }
});
```

---

## Replication Guide

### Step 1: Project Structure

```
/
├── main.py                 # Flask backend
├── pyproject.toml          # Python dependencies
├── manifest.json           # PWA manifest
├── static/
│   ├── script.js          # Main application logic
│   ├── characters.js      # Character definitions
│   ├── style.css          # Application styling
│   └── WugaBot_png420.png # App icon
└── templates/
    └── index.html         # Main HTML template
```

### Step 2: Dependencies (pyproject.toml)

```toml
[project]
name = "wugabot"
version = "0.1.0"
dependencies = [
    "flask",
    "openai",
    "requests",
    "PyPDF2",
    "python-docx",
    "openpyxl",
    "matplotlib",
    "Pillow"
]
```

### Step 3: Environment Setup

1. Set `VENICE_API_KEY` environment variable
2. Install dependencies: `pip install -e .`
3. Run: `python main.py`

### Step 4: Key Implementation Order

1. **Backend Setup**
   - Flask app initialization
   - `/models` endpoint
   - `/chat/stream` endpoint with SSE
   - File processing utilities

2. **Frontend Core**
   - HTML structure with all panels
   - CSS styling with dark theme
   - Model dropdown population
   - Basic chat send/receive

3. **Streaming Implementation**
   - Backend generator function
   - Frontend ReadableStream consumer
   - Content buffer and formatting

4. **Advanced Features**
   - Web search toggle and citations
   - Deep research mode
   - RAG integration
   - Image/vision handling
   - Image generation
   - Visualization creation

5. **State Management**
   - LocalStorage persistence
   - Settings management
   - Chat history

### Step 5: Critical Implementation Details

**1. Venice API Compatibility:**
- Use `max_completion_tokens` not `max_tokens`
- Include `venice_parameters` object in requests
- Handle streaming with proper SSE format

**2. Streaming Response Handling:**
- Parse `data: ` prefix from SSE lines
- Handle `[DONE]` termination signal
- Process content, reasoning, and citations separately

**3. Model Capabilities:**
- Store capabilities in dataset attributes
- Check vision support before image upload
- Check web search support for toggle visibility

**4. Chat History Management:**
- Always include system prompt first
- Maintain alternating user/assistant order
- Save to localStorage after each exchange

**5. Error Handling:**
- Graceful fallbacks for API failures
- Timeout handling for long operations
- User-friendly error messages

---

## Manifest.json (PWA Support)

```json
{
    "name": "WugaBot",
    "short_name": "WugaBot",
    "description": "AI Chat Assistant",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#121212",
    "theme_color": "#121212",
    "icons": [
        {
            "src": "/static/WugaBot_png420.png",
            "sizes": "420x420",
            "type": "image/png"
        }
    ]
}
```

---

## Conclusion

This documentation provides a complete technical specification for replicating WugaBot. Key success factors:

1. **Venice.ai API Integration**: Proper authentication and parameter handling
2. **Streaming Architecture**: SSE for real-time responses
3. **Multi-Model Synthesis**: Parallel execution with ThreadPoolExecutor
4. **State Persistence**: LocalStorage for settings and history
5. **Feature Toggles**: Modular feature activation (RAG, web search, expert mode)
6. **Responsive UI**: Dark theme with mobile-first design

The application demonstrates advanced patterns for building production-ready AI chat interfaces with features comparable to commercial AI assistants.
