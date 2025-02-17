let currentStream = null;
const chatHistory = [];
let botContentBuffer = "";

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
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        modelSelect.appendChild(option);
    });
    modelSelect.value = 'llama-3.3-70b';
}

async function startStream() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    if (!message) return;

    chatHistory.push({ role: 'user', content: message });
    appendMessage(message, 'user');
    userInput.value = '';

    const botMessage = appendMessage('', 'assistant', true);
    botContentBuffer = "";
    showLoading(true);

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
                            const formatted = formatContent(botContentBuffer);
                            botMessage.innerHTML = formatted;
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
    // First handle think blocks
    let formatted = content.replace(/<think>\n?([\s\S]+?)<\/think>/g, (match, content) => {
        return `<div class="reasoning-content"><strong>Reasoning:</strong><br>${content.trim()}</div>`;
    });

    // Then handle code blocks
    formatted = formatted.replace(/```(\w*)\n?([\s\S]+?)\n```/g, (match, lang, code) => {
        const highlightedCode = Prism.highlight(code.trim(), Prism.languages[lang] || Prism.languages.plain, lang || 'plaintext');
        return `<pre class="code-block"><code class="language-${lang}">${highlightedCode.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</code></pre>`;
    });

    // Then handle basic Markdown
    formatted = formatted
        .replace(/\n#{3} (.*)/g, '<h3>$1</h3>')  // h3
        .replace(/\n#{2} (.*)/g, '<h2>$1</h2>')  // h2
        .replace(/\n# (.*)/g, '<h1>$1</h1>')     // h1
        .replace(/\n- (.*)/g, '<li>$1</li>')     // bullet points
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')    // italic
        .split('\n').map(line => line.trim()).join('<br>'); // newlines

    return formatted;
}

function appendMessage(content, role, returnElement = false) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    if (returnElement) {
        messageDiv.innerHTML = content;
    } else {
        const formatted = formatContent(content);
        messageDiv.innerHTML = formatted;
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

document.getElementById('userInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startStream();
});

window.addEventListener('load', fetchModels);