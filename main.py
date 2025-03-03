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
        models = []
        for model in models_data['data']:
            model_info = {'id': model['id']}
            if 'model_spec' in model and 'capabilities' in model['model_spec']:
                if 'supportsWebSearch' in model['model_spec']['capabilities']:
                    model_info['supportsWebSearch'] = model['model_spec']['capabilities']['supportsWebSearch']
            models.append(model_info)
        return json.dumps({'models': models})
    except Exception as e:
        logger.error(f"Error fetching models: {str(e)}")
        return json.dumps({'error': str(e)}), 500

@app.route('/')
def index():
    return render_template('index.html')



@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    data = request.json
    search_enabled = data.get('web_search', False)
    messages = data.get('messages', [])
    max_completion_tokens = data.get('max_tokens', 4000)  # Get max_tokens from request but use as max_completion_tokens
    temperature = data.get('temperature', 0.7)  # Get temperature from request

    def generate(model, messages, temperature, max_completion_tokens, search_enabled):
        try:
            logger.info(f"Generating response for model: {model}")
            logger.info(f"Web search setting: {search_enabled}")

            # Prepare the payload for Venice API
            # Prepare payload following Venice API structure
            payload = {
                "model": model,
                "messages": messages,
                "venice_parameters": {
                    "include_venice_system_prompt": False
                },
                "max_completion_tokens": max_completion_tokens,  # Using max_completion_tokens as per API spec
                "temperature": temperature,
                "stream": True
            }

            # Only add web search parameter for web-enabled models and when explicitly enabled
            if search_enabled == "on":
                payload["venice_parameters"]["enable_web_search"] = "on"

            # Make request to Venice API
            logger.debug("Sending request to Venice API with payload:", json.dumps(payload))
            response = requests.post(
                "https://api.venice.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('VENICE_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json=payload,
                stream=True
            )
            if not response.ok:
                logger.error(f"Venice API error: Status {response.status_code}")
                logger.error(f"Response content: {response.text}")

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
                            logger.debug("Venice API response chunk:", json_data)

                            # Check for venice_parameters at top level first
                            if 'venice_parameters' in json_data:
                                logger.debug("Venice parameters found at top level:", json_data['venice_parameters'])
                                yield f"data: {json.dumps(json_data)}\n\n"

                            # Process content from delta as usual
                            if 'choices' in json_data and json_data['choices'] and 'delta' in json_data['choices'][0]:
                                delta = json_data['choices'][0]['delta']
                                if 'content' in delta:
                                    content = delta['content']
                                    if content:
                                        yield f"data: {json.dumps({'content': content})}\n\n"
                                if 'venice_parameters' in delta:
                                    logger.debug("Venice parameters found in delta:", delta['venice_parameters'])
                                    yield f"data: {json.dumps(json_data)}\n\n"
                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            logger.exception(f"Error in generate: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        generate(
            model=data.get('model', 'llama-3.3-70b'),
            messages=data.get('messages', []),
            temperature=temperature,
            max_completion_tokens=max_completion_tokens,
            search_enabled=search_enabled
        ), 
        mimetype='text/event-stream'
    )

def extract_text_from_file(file_data, file_type):
    try:
        logger.info(f"Extracting text from {file_type} file")
        text = ""
        if file_type == 'txt':
            text = file_data.decode('utf-8')
            logger.debug("Text file decoded successfully")
        elif file_type == 'pdf':
            import fitz  # PyMuPDF
            pdf_file = io.BytesIO(file_data)
            pdf_document = fitz.open(stream=pdf_file, filetype="pdf")
            
            logger.debug(f"PDF file loaded, pages: {len(pdf_document)}")
            
            # Process each page
            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]
                
                # Extract text with better formatting preservation
                page_text = page.get_text("text")
                
                # Extract tables if present (simplified approach)
                tables = page.find_tables()
                if tables and tables.tables:
                    for table in tables.tables:
                        rows = []
                        for cells in table.rows:
                            row_text = " | ".join([page.get_text("text", clip=cell.rect) for cell in cells])
                            rows.append(row_text)
                        table_text = "\n".join(rows)
                        page_text += f"\n\n--- Table ---\n{table_text}\n--- End Table ---\n"
                
                text += f"\n--- Page {page_num + 1} ---\n{page_text}"
            
            pdf_document.close()
        elif file_type in ['doc', 'docx']:
            doc_file = io.BytesIO(file_data)
            doc = docx.Document(doc_file)
            logger.debug(f"DOC file loaded, paragraphs: {len(doc.paragraphs)}")
            text = '\n'.join([paragraph.text for paragraph in doc.paragraphs])
        elif file_type in ['xls', 'xlsx']:
            import pandas as pd
            excel_file = io.BytesIO(file_data)
            # Read all sheets
            excel_data = pd.read_excel(excel_file, sheet_name=None)
            
            # Process each sheet
            tables = []
            for sheet_name, df in excel_data.items():
                # Convert DataFrame to string representation with proper formatting
                table_text = f"\n--- Sheet: {sheet_name} ---\n"
                table_text += df.to_string(index=False)
                tables.append(table_text)
            
            text = "\n\n".join(tables)
            logger.debug(f"Excel file processed, found {len(excel_data)} sheets")

        if not text:
            logger.warning("Warning: Extracted text is empty")
            return None

        logger.info(f"Successfully extracted {len(text)} characters")
        return text.strip()
    except Exception as e:
        logger.exception(f"Error extracting text: {str(e)}")
        return None

@app.route('/process_file', methods=['POST'])
def process_file():
    try:
        logger.info("Starting file processing...")

        if 'file' not in request.files:
            logger.warning("No file in request.files")
            return json.dumps({'error': 'No file part'}), 400, {'Content-Type': 'application/json'}

        file = request.files['file']
        logger.info(f"Received file: {file.filename}")

        if file.filename == '':
            logger.warning("Empty filename received")
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
        logger.debug(f"File size: {len(file_data)} bytes")
        if len(file_data) > 2 * 1024 * 1024:  # 2MB in bytes
            return json.dumps({'error': 'File too large. Maximum size is 2MB'}), 400, {'Content-Type': 'application/json'}

        file_type = file.filename.split('.')[-1].lower()
        if file_type not in ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx']:
            return json.dumps({'error': f'Unsupported file type: {file_type}'}, ensure_ascii=False), 400, {'Content-Type': 'application/json'}

        extracted_text = extract_text_from_file(file_data, file_type)
        if extracted_text is None:
            return json.dumps({'error': 'Failed to extract text from file'}, ensure_ascii=False), 400

        return json.dumps({'text': extracted_text}, ensure_ascii=False), 200, headers
    except Exception as e:
        logger.exception(f"File processing error: {str(e)}")
        return json.dumps({'error': f'File processing error: {str(e)}'}, ensure_ascii=False), 500, headers

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)