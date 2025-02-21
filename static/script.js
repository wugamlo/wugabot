let currentStream = null;
const chatHistory = [];
let botContentBuffer = "";
// Fetch models from the server
async function fetchModels() {
    try {
        const response = await fetch('/models');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        populateModelDropdown(data.models);
    } catch (error) {
        console.error('Error fetching models:', error);
        appendMessage('Failed to fetch models. Please try again.', 'error');
    }
}
// Import character options and system prompts
import { characterOptions, systemPrompts } from './characters.js';

// Load prompt and populate character dropdown when the page loads
window.addEventListener('load', () => {
    fetchModels();
    populateCharacterDropdown();
    const savedPrompt = localStorage.getItem('systemPrompt');
    if (savedPrompt) {
        document.getElementById('systemPrompt').value = savedPrompt;
    }
});

// Populate character dropdown
function populateCharacterDropdown() {
    const characterSelect = document.getElementById('characterSelect');
    characterSelect.innerHTML = '<option value="">Select a character...</option>';
    characterOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.text = option.label;
        characterSelect.appendChild(optionElement);
    });

    // Add event listener for character selection
    characterSelect.addEventListener('change', function() {
        const selectedValue = this.value;
        if (selectedValue && systemPrompts[selectedValue]) {
            document.getElementById('systemPrompt').value = systemPrompts[selectedValue];
            savePrompt(); // Automatically save when character is selected
        }
    });
}
// Function to save the prompt
function savePrompt() {
    const prompt = document.getElementById('systemPrompt').value.trim();
    if (prompt) {
        localStorage.setItem('systemPrompt', prompt);
    }
}

// Function to resize images to deal with too large images
function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target.result;
        };

        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Maintain the aspect ratio
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
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.7); // Adjust quality here if needed
        };

        reader.onerror = (e) => {
            reject(e);
        };

        reader.readAsDataURL(file);
    });
}


// Handle image upload and show preview
function handleImageUpload(input) {
    const imagePreview = document.getElementById('imagePreview');
    if (input.files.length > 0) {
        // Auto-switch to qwen-2.5-vl model for image analysis
        const modelSelect = document.getElementById('modelSelect');
        const previousModel = modelSelect.value;
        modelSelect.value = 'qwen-2.5-vl';
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Image = event.target.result;
            imagePreview.innerHTML = `
                <img src="${base64Image}" alt="Image Preview" style="max-width: 50px; max-height: 50px; margin-left: 10px;" />
                <div style="font-size: 12px; color: #666; margin-top: 4px;">Switched to qwen-2.5-vl for image analysis</div>
            `;
        };
        reader.readAsDataURL(input.files[0]);
    }
}
// Event listeners for both inputs
document.getElementById('galleryInput').addEventListener('change', () => handleImageUpload(document.getElementById('galleryInput')));
document.getElementById('cameraInput').addEventListener('change', () => handleImageUpload(document.getElementById('cameraInput')));

function initEventListeners() {
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                startStream();
                e.preventDefault();
            }
        });
    }

    const galleryInput = document.getElementById('galleryInput');
    const cameraInput = document.getElementById('cameraInput');
    const fileInput = document.getElementById('fileInput');
    
    if (galleryInput) {
        galleryInput.addEventListener('change', () => handleImageUpload(galleryInput));
    }
    if (cameraInput) {
        cameraInput.addEventListener('change', () => handleImageUpload(cameraInput));
    }
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert('File too large. Maximum size is 2MB');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/process_file', {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }

        // Add success notification
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-file-check" style="font-size: 24px; color: #4CAF50;"></i>
                <span style="color: #4CAF50;">File uploaded successfully</span>
            </div>
        `;
        
        // Update messages with the extracted text
        const userMessage = document.getElementById('userInput').value;
        const fileMessage = `📎 File: ${file.name}`;
        
        chatHistory.push({
            role: 'user',
            content: userMessage + '\n\nFile contents:\n' + data.text
        });
        
        // Show the user message and file info in the chat
        appendMessage(userMessage, 'user');
        appendMessage(fileMessage, 'user-file');
        
        // Start the stream with the current model
        startStream();
        
    } catch (error) {
        console.error('Error processing file:', error);
        console.error('Error details:', error.message);
        console.error('Response:', error.response);
        
        let errorMessage = error.message;
        try {
            const responseText = await error.response.text();
            console.error('Response text:', responseText);
            errorMessage = `Server error: ${responseText}`;
        } catch (e) {
            console.error('Could not read response text:', e);
        }
        
        alert(`Error processing file: ${errorMessage}`);
    }
    
    // Clear the file input
    event.target.value = '';
}

// Populate model dropdown
function populateModelDropdown(models) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        modelSelect.appendChild(option);
    });
    modelSelect.value = 'qwen-2.5-vl';
}

// Start streaming data to the chat
async function startStream() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    const galleryInput = document.getElementById('galleryInput');
    const cameraInput = document.getElementById('cameraInput');
    let base64Image = "";

    if (!message && !galleryInput.files.length && !cameraInput.files.length) {
        return;
    }

    // Check for image uploads
    const processImage = async (file) => {
        // Always resize camera photos, and resize any file larger than 2MB
        const isCameraPhoto = file.type.startsWith('image/') && file.name === 'image.jpg';
        if (isCameraPhoto || file.size > 2 * 1024 * 1024) {
            const resizedBlob = await resizeImage(file, 800, 600); // Smaller max dimensions
            const resizedReader = new FileReader();
            resizedReader.onload = (event) => {
                base64Image = event.target.result;
                submitChat(message, base64Image);
            };
            resizedReader.readAsDataURL(resizedBlob);
        } else {
            const reader = new FileReader();
            reader.onload = (event) => {
                base64Image = event.target.result;
                submitChat(message, base64Image);
            };
            reader.readAsDataURL(file);
        }
    };

    // Handle gallery input
    if (galleryInput.files.length > 0) {
        await processImage(galleryInput.files[0]);
        galleryInput.value = ''; // Clear input after handling
    } 
    // Handle camera input
    else if (cameraInput.files.length > 0) {
        await processImage(cameraInput.files[0]);
        cameraInput.value = ''; // Clear input after handling
    } else {
        submitChat(message); // No images to submit
    }
    userInput.value = ''; // Clear input after sending
}

// Submit chat message along with the image
function submitChat(message, base64Image) {
    if (!message && !base64Image) return;
    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    
    // Only add text messages to chat history
    if (message) {
        chatHistory.push({ role: 'user', content: message });
    }
    
    // Prepare messages for API call
    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory // Include previous conversation history
    ];
    
    // Add current message if exists
    if (message) {
        messages.push({ role: 'user', content: [{ type: 'text', text: message }] });
    }
    
    // Add image as the last message if exists (not stored in history)
    if (base64Image) {
        messages.push({
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: base64Image } }]
        });
    }
    appendMessage(message, 'user'); // Append user's message
    if (base64Image) {
        appendMessage(`<img src="${base64Image}" alt="User Uploaded Image" style="max-width: 80%; height: auto;" />`, 'user'); // Display the image in chat
    }
    // Clear the image preview after the message is submitted
    document.getElementById('imagePreview').innerHTML = ''; // Clear the preview
    const botMessage = appendMessage('', 'assistant', true);
    botContentBuffer = "";
    showLoading(true);
    fetchChatResponse(messages, botMessage); // Send the message to fetch response
}
// File input handlers are already set up for galleryInput and cameraInput

// Fetch response from chat
async function fetchChatResponse(messages, botMessage) {
    try {
        const searchEnabled = document.getElementById('searchEnabled').classList.contains('active');
        const response = await fetch('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages,
                model: document.getElementById('modelSelect').value,
                stream: true,
                searchEnabled: searchEnabled
            })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(5).trim();
                    if (!data) continue;
                    if (data === '[DONE]') {
                        showLoading(false);
                        chatHistory.push({ role: 'assistant', content: botContentBuffer });
                        Prism.highlightAll();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            appendMessage(`Error: ${parsed.error}`, 'error');
                            showLoading(false);
                            return;
                        } else if (parsed.content) {
                            botContentBuffer += parsed.content;
                            botMessage.innerHTML = formatContent(botContentBuffer);
                            Prism.highlightAll();
                            scrollToBottom();
                        }
                    } catch (e) {
                        if (data !== '[DONE]') console.error('Error parsing chunk:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Stream error:', error);
        appendMessage('Failed to connect to chat service. Please try again.', 'error');
        showLoading(false);
    }
}

function formatContent(content) {
    let formatted = content.replace(/<think>\n?([\s\S]+?)<\/think>/g, (match, content) => {
        return `<div class="reasoning-content"><strong>Reasoning:</strong><br>${content.trim()}</div>`;
    });
    formatted = formatted.replace(/```(\w*)\n?([\s\S]+?)\n```/g, (match, lang, code) => {
        const highlightedCode = Prism.highlight(
            code.trim(),
            Prism.languages[lang] || Prism.languages.plain,
            lang || 'plaintext'
        );
        return `<pre class="code-block"><code class="language-${lang}">${highlightedCode}</code></pre>`;
    });

    const codeBlockPattern = /<pre class="code-block">[\s\S]*?<\/pre>/g;
    const codeBlocks = [];
    formatted = formatted.replace(codeBlockPattern, (match) => {
        codeBlocks.push(match);
        return `<!-- placeholder:${codeBlocks.length - 1} -->`;
    });

    formatted = formatted
        .replace(/\n#{3} (.*)/g, '<h3>$1</h3>') 
        .replace(/\n#{2} (.*)/g, '<h2>$1</h2>')  
        .replace(/\n# (.*)/g, '<h1>$1</h1>')     
        .replace(/\n- (.*)/g, '<li>$1</li>')     
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
        .replace(/\*(.*?)\*/g, '<em>$1</em>')    
        .split('\n').map(line => line.trim()).join('<br>'); 

    formatted = formatted.replace(/<!-- placeholder:(\d+) -->/g, (match, index) => {
        return codeBlocks[parseInt(index)];
    });

    return formatted;
}

function appendMessage(content, role, returnElement = false) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    if (typeof content === 'string') {
        if (!content.startsWith('<img')) {
            content = content
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&lt;(\/?(?:instructions|format|context|examples|warnings))&gt;/g, '<span class="xml-tag">&lt;$1&gt;</span>')
                .replace(/\n/g, '<br>');
        }
    }
    messageDiv.innerHTML = content;
    chatBox.appendChild(messageDiv);
    if (returnElement) {
        return messageDiv;
    }
    scrollToBottom();
}
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('hidden', !show);
}
function scrollToBottom() {
    const chatBox = document.getElementById('chatBox');
    chatBox.scrollTop = chatBox.scrollHeight;
}
// Settings panel functionality
function initSettingsPanel() {
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.querySelector('.settings-panel');
    
    settingsToggle.addEventListener('click', () => {
        settingsPanel.classList.toggle('visible');
    });
}

function clearChatHistory() {
    chatHistory.length = 0; // Clear the chat history
    document.getElementById('chatBox').innerHTML = ''; // Clear chat display
}

// Event listener for window load
function togglePromptComposer() {
    const composer = document.querySelector('.prompt-composer');
    composer.classList.toggle('visible');
}

function clearFields() {
    const fields = ['instructions', 'format', 'context', 'examples', 'warnings'];
    fields.forEach(field => {
        document.getElementById(field).value = '';
    });
}

function transferPrompt() {
    const fields = {
        instructions: 'instructions',
        format: 'format',
        context: 'context',
        examples: 'examples',
        warnings: 'warnings'
    };
    
    let finalPrompt = '';
    
    for (const [field, tag] of Object.entries(fields)) {
        const content = document.getElementById(field).value.trim();
        if (content) {
            // Preserve line breaks by replacing them with actual newlines
            const formattedContent = content.replace(/\r\n|\r|\n/g, '\n');
            finalPrompt += `<${tag}>\n${formattedContent}\n</${tag}>\n`;
        }
    }
    
    document.getElementById('userInput').value = finalPrompt.replace(/\n\n+/g, '\n');
    togglePromptComposer();
}

// Export functions for global access
window.startStream = startStream;
window.savePrompt = savePrompt;
window.clearChatHistory = clearChatHistory;
window.togglePromptComposer = togglePromptComposer;
window.clearFields = clearFields;
window.transferPrompt = transferPrompt;

function toggleWebSearch(button) {
    button.classList.toggle('active');
}

// Expose function globally
window.toggleWebSearch = toggleWebSearch;

window.addEventListener('load', () => {
    fetchModels();
    initSettingsPanel();
    initEventListeners();
});