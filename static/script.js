let currentStream = null;
const chatHistory = [];

function startStream() {
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

    currentStream = new EventSource(`/chat/stream?timestamp=${Date.now()}`);

    currentStream.onmessage = (event) => {
        if (event.data === 'data: [DONE]') {
            currentStream.close();
            showLoading(false);
            chatHistory.push({ role: 'assistant', content: botMessage.textContent });
            return;
        }

        try {
            const data = JSON.parse(event.data.replace('data: ', ''));
            if (data.error) {
                appendMessage(`Error: ${data.error}`, 'error');
                showLoading(false);
                currentStream.close();
            } else if (data.content) {
                botMessage.textContent += data.content;
                scrollToBottom();
            }
        } catch (e) {
            console.error('Error parsing stream:', e);
        }
    };

    currentStream.addEventListener('open', () => {
        fetch('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                model: 'dolphin-2.9.2-qwen2-72b',
                stream: true
            })
        });
    });

    currentStream.onerror = (error) => {
        console.error('Stream error:', error);
        showLoading(false);
        alert('Stream connection failed. Please check your server and try again.'); // Inform the user
        if (currentStream) currentStream.close();
    };
}

function appendMessage(content, role, returnElement = false) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.textContent = content;
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