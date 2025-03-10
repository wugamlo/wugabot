"""
WugaBot - Chat Interface Backend

This Flask application serves as the backend for the WugaBot chat interface.
It handles API requests, file processing, and AI model communication.

Author: WugaBot Team
Version: 1.0
"""

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
    """
    Retrieves available AI models from the Venice API
    
    Returns:
        JSON response with available models or error information
    """
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
            # Pass the entire model structure to the client
            # This includes model_spec with offline status and all capabilities
            models.append(model)
        return json.dumps({'models': models})
    except Exception as e:
        logger.error(f"Error fetching models: {str(e)}")
        return json.dumps({'error': str(e)}), 500

@app.route('/')
def index():
    """
    Serves the main application page
    
    Returns:
        Rendered HTML template
    """
    return render_template('index.html')



@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    """
    Handles streaming chat completions from the AI model
    
    Accepts:
        - JSON request with messages, model selection, and parameters
        
    Returns:
        - Streaming response with AI-generated content
    """
    data = request.json
    search_enabled = data.get('web_search', False)
    messages = data.get('messages', [])
    
    # Use max_completion_tokens as the primary parameter, but fall back to max_tokens for backward compatibility
    max_completion_tokens = data.get('max_completion_tokens', data.get('max_tokens', 4000))
    temperature = data.get('temperature', 0.7)

    def generate(model, messages, temperature, max_completion_tokens, search_enabled):
        """
        Generator function that streams AI responses
        
        Args:
            model (str): The AI model to use
            messages (list): Chat history to send to the model
            temperature (float): Temperature parameter for generation
            max_completion_tokens (int): Maximum tokens to generate
            search_enabled (bool): Whether to enable web search
            
        Yields:
            Streaming response data from the AI model
        """
        try:
            logger.info(f"Generating response for model: {model}")
            logger.info(f"Web search setting: {search_enabled}")
            logger.info(f"Max completion tokens: {max_completion_tokens}")

            # Prepare the payload for Venice API with proper parameter names
            payload = {
                "model": model,
                "messages": messages,
                "venice_parameters": {
                    "include_venice_system_prompt": False
                },
                "max_completion_tokens": max_completion_tokens,  # Using specified parameter name
                "temperature": temperature,
                "stream": True
            }

            # Only add web search parameter when explicitly enabled
            if search_enabled == "on":
                payload["venice_parameters"]["enable_web_search"] = "on"

            # Make request to Venice API
            logger.debug(f"Sending request to Venice API with payload: {json.dumps(payload)}")
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
                yield f"data: {json.dumps({'error': f'API error: {response.status_code}'})}\n\n"
                return

            # Stream the response with improved handling
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
                    
                try:
                    json_data = json.loads(data)
                    
                    # Forward venice_parameters at the top level
                    if 'venice_parameters' in json_data:
                        logger.debug(f"Venice parameters found at top level: {json_data['venice_parameters']}")
                        yield f"data: {json.dumps(json_data)}\n\n"

                    # Process content and reasoning_content if present
                    if 'content' in json_data:
                        yield f"data: {json.dumps({'content': json_data['content']})}\n\n"
                    
                    # Use standardized field for reasoning content
                    if 'reasoning_content' in json_data:
                        logger.debug(f"Found reasoning_content at top level: {json_data['reasoning_content'][:100]}...")
                        yield f"data: {json.dumps({'reasoning_content': json_data['reasoning_content']})}\n\n"

                    # Process delta content for streaming
                    if 'choices' in json_data and json_data['choices'] and 'delta' in json_data['choices'][0]:
                        delta = json_data['choices'][0]['delta']
                        
                        # Stream content
                        if 'content' in delta and delta['content']:
                            yield f"data: {json.dumps({'content': delta['content']})}\n\n"
                        
                        # Stream reasoning content
                        if 'reasoning_content' in delta and delta['reasoning_content']:
                            yield f"data: {json.dumps({'reasoning_content': delta['reasoning_content']})}\n\n"
                        
                        # Stream venice parameters
                        if 'venice_parameters' in delta:
                            logger.debug(f"Venice parameters found in delta: {delta['venice_parameters']}")
                            yield f"data: {json.dumps(json_data)}\n\n"
                            
                except json.JSONDecodeError as e:
                    logger.warning(f"JSON decode error: {str(e)}, data: {data[:100]}...")
                    continue

        except Exception as e:
            logger.exception(f"Error in generate: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        generate(
            model=data.get('model', 'qwen-2.5-qwq-32b'),
            messages=data.get('messages', []),
            temperature=temperature,
            max_completion_tokens=max_completion_tokens,
            search_enabled=search_enabled
        ), 
        mimetype='text/event-stream'
    )

def extract_text_from_file(file_data, file_type):
    """
    Extracts text content from various file formats
    
    Supports txt, pdf, doc/docx, and xls/xlsx files
    
    Args:
        file_data (bytes): Binary file data
        file_type (str): File extension indicating the type
        
    Returns:
        str: Extracted text content or None if extraction fails
    """
    try:
        logger.info(f"Extracting text from {file_type} file")
        text = ""
        if file_type == 'txt':
            text = file_data.decode('utf-8')
            logger.debug("Text file decoded successfully")
        elif file_type == 'pdf':
            try:
                # Try using PyMuPDF first
                import fitz  # PyMuPDF
                pdf_file = io.BytesIO(file_data)
                pdf_document = fitz.open(stream=pdf_file, filetype="pdf")
                
                logger.debug(f"PDF file loaded, pages: {len(pdf_document)}")
                
                # Process each page
                for page_num in range(len(pdf_document)):
                    page = pdf_document[page_num]
                    
                    # Extract text with better formatting preservation
                    page_text = page.get_text("text")
                    
                    # Safer table extraction
                    try:
                        tables = page.find_tables()
                        if tables and hasattr(tables, 'tables') and tables.tables:
                            for table in tables.tables:
                                rows = []
                                for cells in table.rows:
                                    row_text = " | ".join([page.get_text("text", clip=cell.rect) for cell in cells])
                                    rows.append(row_text)
                                table_text = "\n".join(rows)
                                page_text += f"\n\n--- Table ---\n{table_text}\n--- End Table ---\n"
                    except Exception as table_err:
                        logger.warning(f"Table extraction error: {str(table_err)}")
                    
                    text += f"\n--- Page {page_num + 1} ---\n{page_text}"
                
                pdf_document.close()
            except Exception as fitz_err:
                # Fallback to PyPDF2 if PyMuPDF fails
                logger.warning(f"PyMuPDF failed: {str(fitz_err)}, falling back to PyPDF2")
                pdf_file = io.BytesIO(file_data)
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    page_text = page.extract_text() or "No text extracted"
                    text += f"\n--- Page {page_num + 1} ---\n{page_text}"
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
    """
    Processes uploaded files and extracts their text content
    
    Handles various file formats including txt, pdf, doc/docx, and xls/xlsx
    Enforces file size limits and provides appropriate error messages
    
    Returns:
        JSON response with extracted text or error information
    """
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

@app.route('/generate_visualization', methods=['POST'])
def generate_visualization():
    """
    Generates visualizations based on the request type and data
    
    Supports charts, diagrams, and simple drawings
    
    Args:
        Request JSON with visualization_type and data fields
        
    Returns:
        JSON with the generated visualization as SVG or base64 image
    """
    try:
        data = request.json
        visualization_type = data.get('visualization_type')
        
        # Improved handling of visualization data
        viz_data = data.get('data', {})
        if isinstance(viz_data, str):
            try:
                import json
                viz_data = json.loads(viz_data)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error in visualization data: {e}")
                logger.error(f"Raw data: {viz_data[:100]}")
                
                # Attempt to salvage malformed JSON
                try:
                    # Try to fix common JSON issues
                    fixed_data = viz_data.replace('\\"', '"').replace('\\\\', '\\')
                    viz_data = json.loads(fixed_data)
                except Exception as fix_error:
                    logger.error(f"Could not fix JSON: {fix_error}")
                    viz_data = {}
        
        if visualization_type == 'chart':
            # Generate chart using matplotlib
            import matplotlib.pyplot as plt
            import matplotlib
            matplotlib.use('Agg')
            import io
            import base64
            
            chart_type = viz_data.get('chart_type', 'bar')
            title = viz_data.get('title', 'Chart')
            labels = viz_data.get('labels', [])
            values = viz_data.get('values', [])
            
            plt.figure(figsize=(10, 6))
            
            if chart_type == 'bar':
                plt.bar(labels, values)
            elif chart_type == 'line':
                plt.plot(labels, values)
            elif chart_type == 'pie':
                plt.pie(values, labels=labels, autopct='%1.1f%%')
            
            plt.title(title)
            plt.tight_layout()
            
            # Convert plot to base64 image
            buf = io.BytesIO()
            plt.savefig(buf, format='png')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            plt.close()
            
            return json.dumps({
                'image': f'data:image/png;base64,{img_str}',
                'type': 'chart'
            })
            
        elif visualization_type == 'diagram':
            # Generate SVG diagram
            import svgwrite
            
            diagram_type = viz_data.get('diagram_type', 'flowchart')
            elements = viz_data.get('elements', [])
            
            # Create a simple SVG drawing with white background for visibility
            dwg = svgwrite.Drawing('diagram.svg', profile='tiny', size=('800px', '600px'))
            # Add a background rectangle
            dwg.add(dwg.rect((0, 0), ('100%', '100%'), fill='#ffffff'))
            
            # Default elements for a simple flowchart if none provided
            if not elements and diagram_type == 'flowchart':
                elements = [
                    {'text': 'Start'},
                    {'text': 'Decision\n(Yes or No?)'},
                    {'text': 'Yes', 'branch': 'left'},
                    {'text': 'No', 'branch': 'right'},
                    {'text': 'End', 'branch': 'left'},
                    {'text': 'End', 'branch': 'right'}
                ]
            
            if diagram_type == 'flowchart':
                # Improved flowchart implementation
                main_y_pos = 50
                
                # Draw the start node
                dwg.add(dwg.rect((325, main_y_pos), (150, 80), fill='#f0f0f0', stroke='#000000', rx=5, ry=5))
                dwg.add(dwg.text(elements[0].get('text', 'Start'), insert=(400, main_y_pos + 45), 
                                text_anchor="middle", font_size=16))
                
                # Draw connector
                main_y_pos += 100
                dwg.add(dwg.line((400, main_y_pos - 20), (400, main_y_pos + 20), stroke='#000000', stroke_width=2))
                dwg.add(dwg.polygon([(395, main_y_pos + 10), (400, main_y_pos + 20), (405, main_y_pos + 10)], 
                                  fill='#000000'))
                
                # Draw decision node
                main_y_pos += 50
                dwg.add(dwg.polygon([(400, main_y_pos), (475, main_y_pos + 50), (400, main_y_pos + 100), (325, main_y_pos + 50)], 
                                  fill='#f0f0f0', stroke='#000000'))
                
                # Multi-line text for decision
                decision_text = elements[1].get('text', 'Decision?').split("\n")
                for i, line in enumerate(decision_text):
                    y_offset = main_y_pos + 50 + (i - len(decision_text)/2) * 20
                    dwg.add(dwg.text(line, insert=(400, y_offset), text_anchor="middle", font_size=14))
                
                # Draw Yes/No paths
                main_y_pos += 120
                
                # Yes branch (left)
                dwg.add(dwg.line((350, main_y_pos - 20), (250, main_y_pos + 50), stroke='#000000', stroke_width=2))
                dwg.add(dwg.polygon([(260, main_y_pos + 45), (250, main_y_pos + 50), (255, main_y_pos + 35)], 
                                  fill='#000000'))
                dwg.add(dwg.text("Yes", insert=(290, main_y_pos + 10), text_anchor="middle", font_size=14))
                
                # No branch (right)
                dwg.add(dwg.line((450, main_y_pos - 20), (550, main_y_pos + 50), stroke='#000000', stroke_width=2))
                dwg.add(dwg.polygon([(545, main_y_pos + 45), (550, main_y_pos + 50), (540, main_y_pos + 40)], 
                                  fill='#000000'))
                dwg.add(dwg.text("No", insert=(510, main_y_pos + 10), text_anchor="middle", font_size=14))
                
                # Left node (Yes result)
                left_y = main_y_pos + 70
                dwg.add(dwg.rect((175, left_y), (150, 80), fill='#f0f0f0', stroke='#000000', rx=5, ry=5))
                dwg.add(dwg.text(elements[2].get('text', 'Yes'), insert=(250, left_y + 45), 
                                text_anchor="middle", font_size=16))
                
                # Right node (No result)
                dwg.add(dwg.rect((475, left_y), (150, 80), fill='#f0f0f0', stroke='#000000', rx=5, ry=5))
                dwg.add(dwg.text(elements[3].get('text', 'No'), insert=(550, left_y + 45), 
                                text_anchor="middle", font_size=16))
                
                # Draw connectors to End nodes
                left_y += 100
                
                # Left End connector
                dwg.add(dwg.line((250, left_y - 20), (250, left_y + 20), stroke='#000000', stroke_width=2))
                dwg.add(dwg.polygon([(245, left_y + 10), (250, left_y + 20), (255, left_y + 10)], 
                                  fill='#000000'))
                
                # Right End connector
                dwg.add(dwg.line((550, left_y - 20), (550, left_y + 20), stroke='#000000', stroke_width=2))
                dwg.add(dwg.polygon([(545, left_y + 10), (550, left_y + 20), (555, left_y + 10)], 
                                  fill='#000000'))
                
                # Left End node
                dwg.add(dwg.rect((175, left_y + 40), (150, 80), fill='#f0f0f0', stroke='#000000', rx=5, ry=5))
                dwg.add(dwg.text(elements[4].get('text', 'End'), insert=(250, left_y + 85), 
                                text_anchor="middle", font_size=16))
                
                # Right End node
                dwg.add(dwg.rect((475, left_y + 40), (150, 80), fill='#f0f0f0', stroke='#000000', rx=5, ry=5))
                dwg.add(dwg.text(elements[5].get('text', 'End'), insert=(550, left_y + 85), 
                                text_anchor="middle", font_size=16))
            
            svg_string = dwg.tostring()
            return json.dumps({
                'svg': svg_string,
                'type': 'diagram'
            })
            
        elif visualization_type == 'drawing':
            # Generate a simple drawing based on text description
            from PIL import Image, ImageDraw
            import io
            import base64
            
            description = viz_data.get('description', '')
            
            # Create a blank canvas
            img = Image.new('RGB', (500, 500), color='white')
            draw = ImageDraw.Draw(img)
            
            # Very basic drawing based on keywords in description
            if 'circle' in description.lower():
                draw.ellipse((100, 100, 400, 400), outline='black')
            elif 'square' in description.lower():
                draw.rectangle((100, 100, 400, 400), outline='black')
            elif 'triangle' in description.lower():
                draw.polygon([(250, 100), (100, 400), (400, 400)], outline='black')
            else:
                # Default drawing
                draw.line((100, 100, 400, 400), fill='black', width=2)
                draw.line((400, 100, 100, 400), fill='black', width=2)
            
            # Convert to base64
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            
            return json.dumps({
                'image': f'data:image/png;base64,{img_str}',
                'type': 'drawing'
            })
        
        else:
            return json.dumps({'error': 'Unsupported visualization type'}), 400
            
    except Exception as e:
        logger.exception(f"Visualization generation error: {str(e)}")
        return json.dumps({'error': f'Visualization error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
