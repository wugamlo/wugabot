let currentStream = null;
const chatHistory = [];

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

function populateModelDropdown(models) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = ''; // Clear existing options
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        modelSelect.appendChild(option);
    });
    // Set default model
    modelSelect.value = 'llama-3.3-70b';
}


async function startStream() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    // Add user message
    chatHistory.push({ role: 'user', content: message });
    appendMessage(message, 'user');
    userInput.value = '';

    // Add empty bot message container
    const botMessage = appendMessage('', 'assistant', true);

    // Show loading indicator
    showLoading(true);

    // Close any existing stream
    if (currentStream) currentStream.close();

    try {
        const response = await fetch('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                model: document.getElementById('modelSelect').value,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

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
                        chatHistory.push({ role: 'assistant', content: botMessage.textContent });
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            appendMessage(`Error: ${parsed.error}`, 'error');
                            showLoading(false);
                            return;
                        } else if (parsed.content) {
                            // Basic formatting attempt (needs improvement)
                            let formattedContent = parsed.content;
                            // Add more sophisticated formatting logic here based on content type (e.g., Markdown parsing)

                            botMessage.innerHTML += formattedContent; // Use innerHTML to allow for basic HTML rendering
                            scrollToBottom();
                        }
                    } catch (e) {
                        if (data !== '[DONE]') {
                            console.error('Error parsing chunk:', e);
                        }
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

function appendMessage(content, role, returnElement = false) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    if (returnElement) {
        messageDiv.innerHTML = content;
    } else {
        // Format code blocks with language detection
        const formattedContent = content.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'plaintext';
            return `<pre><code class="language-${language}">${code.trim()}</code></pre>`;
        });
        
        // Format headers
        const withHeaders = formattedContent.replace(/^(#{1,6})\s(.+)$/gm, (match, hashes, text) => {
            const level = hashes.length;
            return `<h${level}>${text}</h${level}>`;
        });
        
        // Format bullet points
        const withBullets = withHeaders.replace(/^[-*]\s(.+)$/gm, '<li>$1</li>');
        
        messageDiv.innerHTML = withBullets;
    }
    
    chatBox.appendChild(messageDiv);
    scrollToBottom();
    return returnElement ? messageDiv : null;
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('hidden', !show);
}

function scrollToBottom() {
    const chatBox = document.getElementById('chatBox');
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Enter key handler
document.getElementById('userInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startStream();
});

// Initialize model dropdown on page load
window.addEventListener('load', fetchModels);