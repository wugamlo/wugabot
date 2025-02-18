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
// Load prompt from localStorage when the page loads
window.addEventListener('load', () => {
    fetchModels();
    const savedPrompt = localStorage.getItem('systemPrompt');
    if (savedPrompt) {
        document.getElementById('systemPrompt').value = savedPrompt;
    }
});
// Function to save the prompt
function savePrompt() {
    const prompt = document.getElementById('systemPrompt').value.trim();
    if (prompt) {
        localStorage.setItem('systemPrompt', prompt);
    }
}

// Handle image upload and show preview
function handleImageUpload(input) {
    const imagePreview = document.getElementById('imagePreview');
    if (input.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Image = event.target.result;
            imagePreview.innerHTML = `<img src="${base64Image}" alt="Image Preview" style="max-width: 50px; max-height: 50px; margin-left: 10px;" />`;
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
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startStream();
                e.preventDefault();
            }
        });
    }

    const galleryInput = document.getElementById('galleryInput');
    const cameraInput = document.getElementById('cameraInput');
    
    if (galleryInput) {
        galleryInput.addEventListener('change', () => handleImageUpload(galleryInput));
    }
    if (cameraInput) {
        cameraInput.addEventListener('change', () => handleImageUpload(cameraInput));
    }
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
    const galleryInput = document.getElementById('galleryInput'); // Renamed to avoid confusion
    const cameraInput = document.getElementById('cameraInput'); // Added for clarity
    let base64Image = "";
    // Convert uploaded image to Base64 for sending with the message
    if (galleryInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (event) => {
            base64Image = event.target.result;
            submitChat(message, base64Image);
            galleryInput.value = ''; // Clear the file input after submitting
        };
        reader.readAsDataURL(galleryInput.files[0]);
    } else if (cameraInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (event) => {
            base64Image = event.target.result;
            submitChat(message, base64Image);
            cameraInput.value = ''; // Clear the file input after submitting
        };
        reader.readAsDataURL(cameraInput.files[0]);
    } else {
        submitChat(message);
    }
    userInput.value = ''; // Clear input after sending
}

// Submit chat message along with the image
function submitChat(message, base64Image) {
    if (!message && !base64Image) return;
    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    chatHistory.push({ role: 'user', content: message });
    // Prepare messages to include only one image at the last position
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [{ type: 'text', text: message }] },
        ...chatHistory
    ];
    // If there is a base64 image, push it as the last element
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
        const response = await fetch('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages,
                model: document.getElementById('modelSelect').value,
                stream: true
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
    
    if (role === 'assistant') {
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `
            <span class="bot-name">WugaBot</span>
            <span class="model-id">${document.getElementById('modelSelect').value}</span>
            <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        `;
        messageDiv.appendChild(header);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = content;
    messageDiv.appendChild(contentDiv);
    
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
window.addEventListener('load', () => {
    fetchModels();
    initSettingsPanel();
    initEventListeners();
});