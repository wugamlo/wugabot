from flask import Flask, Response, render_template, request
from openai import OpenAI
import os
import json

app = Flask(__name__)

client = OpenAI(
    base_url="https://api.venice.ai/api/v1",
    api_key=os.getenv('VENICE_API_KEY')
)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    data = request.json

    def generate():
        try:
            stream = client.chat.completions.create(
                model=data.get('model', 'llama-3.3-70b'),
                messages=data['messages'],
                temperature=data.get('temperature', 0.7),
                max_tokens=data.get('max_tokens', 4000),
                stream=True
            )

            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield f"data: {json.dumps({'content': chunk.choices[0].delta.content})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)