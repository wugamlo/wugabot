from flask import Flask, Response, render_template, request
from openai import OpenAI
import os
import json
import PyPDF2
import docx
import io

app = Flask(__name__)

client = OpenAI(
    base_url="https://api.venice.ai/api/v1",
    api_key=os.getenv('VENICE_API_KEY')
)

@app.route('/models')
def get_models():
    try:
        response = client.models.list()
        text_models = [model for model in response.data if model.type == 'text']
        return json.dumps({'models': [{'id': model.id} for model in text_models]})
    except Exception as e:
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
    results = brave.search(q=query, count=count)
    return '\n'.join([result.get('description', '') for result in results.get('web', {}).get('results', [])[:3]])

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
            search_results = cached_search(query)
            if search_results:
                context_msg = {"role": "system", "content": f"Web search results:\n{search_results}"}
                messages.insert(-1, context_msg)
        except Exception as e:
            print(f"Search error: {str(e)}")

    def generate():
        try:
            stream = client.chat.completions.create(
                model=data.get('model', 'qwen-2.5-vl'),
                messages=data['messages'],
                temperature=data.get('temperature', 0.7),
                max_tokens=data.get('max_tokens', 4000),
                stream=True
            )

            for chunk in stream:
                if hasattr(chunk, 'choices') and chunk.choices and hasattr(chunk.choices[0], 'delta') and hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                    yield f"data: {json.dumps({'content': chunk.choices[0].delta.content})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
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