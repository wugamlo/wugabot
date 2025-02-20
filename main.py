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

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    data = request.json

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
def extract_text_from_file(file_data, file_type):
    text = ""
    if file_type == 'txt':
        text = file_data.decode('utf-8')
    elif file_type == 'pdf':
        pdf_file = io.BytesIO(file_data)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        for page in pdf_reader.pages:
            text += page.extract_text()
    elif file_type in ['doc', 'docx']:
        doc_file = io.BytesIO(file_data)
        doc = docx.Document(doc_file)
        text = '\n'.join([paragraph.text for paragraph in doc.paragraphs])
    return text.strip()

@app.route('/process_file', methods=['POST'])
def process_file():
    try:
        file = request.files['file']
        if not file:
            return json.dumps({'error': 'No file provided'}), 400
            
        # Check file size (2MB limit)
        file_data = file.read()
        if len(file_data) > 2 * 1024 * 1024:  # 2MB in bytes
            return json.dumps({'error': 'File too large. Maximum size is 2MB'}), 400
            
        file_type = file.filename.split('.')[-1].lower()
        if file_type not in ['txt', 'pdf', 'doc', 'docx']:
            return json.dumps({'error': 'Unsupported file type'}), 400
            
        extracted_text = extract_text_from_file(file_data, file_type)
        return json.dumps({'text': extracted_text})
    except Exception as e:
        return json.dumps({'error': str(e)}), 500
