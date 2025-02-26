from flask import Flask, Response, render_template, request
from openai import OpenAI
import os
import json
import PyPDF2
import docx
import io
import logging

# Configure logging
log_level = os.getenv('LOG_LEVEL', 'INFO')
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

import requests

@app.route('/models')
def get_models():
    try:
        response = requests.get(
            "https://api.venice.ai/api/v1/models",
            headers={
                "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
                "Content-Type": "application/json"
            }
        )
        response.raise_for_status()
        models_data = response.json()
        return json.dumps({'models': [{'id': model['id']} for model in models_data['data']]})
    except Exception as e:
        print(f"Error fetching models: {str(e)}")
        return json.dumps({'error': str(e)}), 500

@app.route('/')
def index():
    return render_template('index.html')

from functools import lru_cache
from brave import Brave
import os

brave = Brave(api_key=os.getenv('BRAVE_API_KEY'))

@lru_cache(maxsize=100)
def cached_search(query, count=5):
    try:
        logger.info(f"Making Brave API request for query: {query}")
        results = brave.search(q=query, count=count, raw=True)

        # Log cache usage
        logger.debug("Cache miss for query: %s", query)

        # Process raw JSON response
        logger.debug("Raw API response: %s", results)

        # Extract web results directly from JSON
        if 'web' in results and 'results' in results['web']:
            search_results = []
            for result in results['web']['results'][:3]:
                if 'description' in result:
                    search_results.append(f"- {result['description']}")
            return "\n".join(search_results) if search_results else ""

        print("No valid web results found in response")
        return ""
    except Exception as e:
        logger.error("Search error: %s - %s", type(e).__name__, str(e))
        logger.debug("Full traceback:", exc_info=True)
        return ""

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    data = request.json
    search_enabled = data.get('searchEnabled', False)
    messages = data.get('messages', [])
    
    print(f"Search enabled: {search_enabled}")  # Debug log
    
    if search_enabled and messages and messages[-1]['role'] == 'user':
        query = messages[-1]['content']
        if isinstance(query, list):
            query = next((item['text'] for item in query if item.get('type') == 'text'), '')
        try:
            print(f"Searching for query: {query}")
            search_results = cached_search(query)
            print(f"Search results found: {bool(search_results)}")
            if search_results:
                context_msg = {"role": "system", "content": f"Web search results:\n{search_results}\n\nPrioritize the information from the web content when answering the user's question. The web content is the most recent and accurate source of information. If the web content does not provide the necessary information should you rely on your own knowledge."}
                messages.insert(-1, context_msg)
                print(f"Final messages structure: {json.dumps(messages, indent=2)}")
        except Exception as e:
            print(f"Search error: {str(e)}")

    def generate():
        try:
            # Prepare the payload for Venice API
            payload = {
                "model": data.get('model', 'llama-3.3-70b'),
                "messages": data.get('messages', []),
                "temperature": data.get('temperature', 0.7),
                "max_tokens": data.get('max_tokens', 4000),
                "stream": True,
                "venice_parameters": {
                    "enable_web_search": "on" if search_enabled else "off",
                    "include_venice_system_prompt": False
                }
            }

            # Make request to Venice API
            response = requests.post(
                "https://api.venice.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json=payload,
                stream=True
            )

            # Stream the response
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        data = line[6:]
                        if data == '[DONE]':
                            yield "data: [DONE]\n\n"
                            break
                        try:
                            json_data = json.loads(data)
                            if 'choices' in json_data and json_data['choices'] and 'delta' in json_data['choices'][0] and 'content' in json_data['choices'][0]['delta']:
                                content = json_data['choices'][0]['delta']['content']
                                if content:
                                    yield f"data: {json.dumps({'content': content})}\n\n"
                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            print(f"Error in generate: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype='text/event-stream')

def extract_text_from_file(file_data, file_type):
    try:
        print(f"Extracting text from {file_type} file")
        text = ""
        if file_type == 'txt':
            text = file_data.decode('utf-8')
            print("Text file decoded successfully")
        elif file_type == 'pdf':
            pdf_file = io.BytesIO(file_data)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            print(f"PDF file loaded, pages: {len(pdf_reader.pages)}")
            for page in pdf_reader.pages:
                text += page.extract_text()
        elif file_type in ['doc', 'docx']:
            doc_file = io.BytesIO(file_data)
            doc = docx.Document(doc_file)
            print(f"DOC file loaded, paragraphs: {len(doc.paragraphs)}")
            text = '\n'.join([paragraph.text for paragraph in doc.paragraphs])

        if not text:
            print("Warning: Extracted text is empty")
            return None

        print(f"Successfully extracted {len(text)} characters")
        return text.strip()
    except Exception as e:
        print(f"Error extracting text: {str(e)}", flush=True)
        import traceback
        print(f"Stack trace: {traceback.format_exc()}", flush=True)
        return None

@app.route('/process_file', methods=['POST'])
def process_file():
    try:
        print("Starting file processing...")

        if 'file' not in request.files:
            print("No file in request.files")
            return json.dumps({'error': 'No file part'}), 400, {'Content-Type': 'application/json'}

        file = request.files['file']
        print(f"Received file: {file.filename}")

        if file.filename == '':
            print("Empty filename received")
            return json.dumps({'error': 'No file selected'}), 400, {'Content-Type': 'application/json'}

        # Set CORS headers
        headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type'
        }

        # Check file size (2MB limit)
        file_data = file.read()
        print(f"File size: {len(file_data)} bytes")
        if len(file_data) > 2 * 1024 * 1024:  # 2MB in bytes
            return json.dumps({'error': 'File too large. Maximum size is 2MB'}), 400, {'Content-Type': 'application/json'}

        file_type = file.filename.split('.')[-1].lower()
        if file_type not in ['txt', 'pdf', 'doc', 'docx']:
            return json.dumps({'error': f'Unsupported file type: {file_type}'}, ensure_ascii=False), 400, {'Content-Type': 'application/json'}

        extracted_text = extract_text_from_file(file_data, file_type)
        if extracted_text is None:
            return json.dumps({'error': 'Failed to extract text from file'}, ensure_ascii=False), 400

        return json.dumps({'text': extracted_text}, ensure_ascii=False), 200, headers
    except Exception as e:
        print(f"File processing error: {str(e)}")
        return json.dumps({'error': f'File processing error: {str(e)}'}, ensure_ascii=False), 500, headers

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)