let currentStream = null;
const chatHistory = [];
let botContentBuffer = "";
let lastCitations = null;

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

import { characterOptions, systemPrompts } from './characters.js';

async function fetchCollections() {
    try {
        const response = await fetch('https://wugamlo-vector-store.replit.app/api/collections');
        const data = await response.json();
        return data.collections;
    } catch (error) {
        console.error('Error fetching collections:', error);
        return [];
    }
}

async function searchCollection(collectionName, query, limit = 5) {
    try {
        const response = await fetch(`https://wugamlo-vector-store.replit.app/api/collections/${collectionName}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, limit })
        });
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('Error searching collection:', error);
        return [];
    }
}

async function populateKnowledgeBaseDropdown() {
    const knowledgeBaseSelect = document.getElementById('knowledgeBase');
    knowledgeBaseSelect.innerHTML = '<option value="">Select a collection...</option>';

    try {
        const collections = await fetchCollections();
        collections.forEach(collection => {
            const option = document.createElement('option');
            option.value = collection;
            option.textContent = collection;
            knowledgeBaseSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating knowledge base dropdown:', error);
    }
}

window.addEventListener('load', () => {
    fetchModels();
    populateCharacterDropdown();

    try {
        const savedChatHistory = localStorage.getItem('chatHistory');
        if (savedChatHistory) {
            const parsedHistory = JSON.parse(savedChatHistory);
            if (Array.isArray(parsedHistory)) {
                chatHistory.length = 0;
                parsedHistory.forEach(msg => chatHistory.push(msg));
                console.log("📂 Loaded chat history from localStorage with", chatHistory.length, "messages");

                chatHistory.forEach(msg => {
                    if (msg.role === 'user' || msg.role === 'assistant') {
                        appendMessage(msg.content, msg.role);
                    }
                });
            }
        }
    } catch (e) {
        console.warn("Could not load chat history from localStorage:", e);
    }

    const savedPrompt = localStorage.getItem('systemPrompt');
    const savedMaxTokens = localStorage.getItem('maxTokens');
    const savedTemperature = localStorage.getItem('temperature');
    const savedRagEnabled = localStorage.getItem('ragEnabled') === 'true';
    const savedKnowledgeBase = localStorage.getItem('knowledgeBase');

    if (savedPrompt) {
        document.getElementById('systemPrompt').value = savedPrompt;
    }

    if (savedMaxTokens) {
        document.getElementById('maxTokens').value = savedMaxTokens;
    }

    if (savedTemperature) {
        document.getElementById('temperature').value = savedTemperature;
        document.getElementById('temperatureValue').textContent = savedTemperature;
    }

    const ragEnabledToggle = document.getElementById('ragEnabled');
    const knowledgeBaseContainer = document.getElementById('knowledgeBaseContainer');

    ragEnabledToggle.checked = savedRagEnabled;
    knowledgeBaseContainer.style.display = savedRagEnabled ? 'block' : 'none';

    if (savedRagEnabled) {
        populateKnowledgeBaseDropdown();

        if (savedKnowledgeBase) {
            setTimeout(() => {
                document.getElementById('knowledgeBase').value = savedKnowledgeBase;
            }, 500);
        }
    }

    ragEnabledToggle.addEventListener('change', function() {
        knowledgeBaseContainer.style.display = this.checked ? 'block' : 'none';
        if (this.checked) {
            populateKnowledgeBaseDropdown();
        }
        localStorage.setItem('ragEnabled', this.checked);
    });

    document.getElementById('knowledgeBase').addEventListener('change', function() {
        localStorage.setItem('knowledgeBase', this.value);
    });

    const temperatureSlider = document.getElementById('temperature');
    temperatureSlider.addEventListener('input', function() {
        document.getElementById('temperatureValue').textContent = this.value;
    });
});

function populateCharacterDropdown() {
    const characterSelect = document.getElementById('characterSelect');
    characterSelect.innerHTML = '<option value="">Select a character...</option>';
    characterOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.text = option.label;
        characterSelect.appendChild(optionElement);
    });

    characterSelect.addEventListener('change', function() {
        const selectedValue = this.value;
        if (selectedValue && systemPrompts[selectedValue]) {
            document.getElementById('systemPrompt').value = systemPrompts[selectedValue];
            saveSettings();
        }
    });
}

function saveSettings() {
    const prompt = document.getElementById('systemPrompt').value.trim();
    const maxTokens = document.getElementById('maxTokens').value;
    const temperature = document.getElementById('temperature').value;
    const ragEnabled = document.getElementById('ragEnabled').checked;
    const knowledgeBase = document.getElementById('knowledgeBase').value;

    if (prompt) {
        localStorage.setItem('systemPrompt', prompt);
    }

    localStorage.setItem('maxTokens', maxTokens);
    localStorage.setItem('temperature', temperature);
    localStorage.setItem('ragEnabled', ragEnabled);
    localStorage.setItem('knowledgeBase', knowledgeBase);

    const settingsPanel = document.querySelector('.settings-panel');
    const feedback = document.createElement('div');
    feedback.className = 'settings-feedback';
    feedback.textContent = 'Settings saved!';
    feedback.style.color = '#4CAF50';
    feedback.style.padding = '10px';
    feedback.style.textAlign = 'center';

    settingsPanel.appendChild(feedback);
    setTimeout(() => feedback.remove(), 2000);
}

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
            }, 'image/jpeg', 0.7);
        };

        reader.onerror = (e) => {
            reject(e);
        };

        reader.readAsDataURL(file);
    });
}

function handleImageUpload(input) {
    const imagePreview = document.getElementById('imagePreview');
    if (input.files.length > 0) {
        const modelSelect = document.getElementById('modelSelect');
        const headerModelSelect = document.getElementById('headerModelSelect');
        const previousModel = modelSelect.value;

        modelSelect.value = 'qwen-2.5-vl';
        headerModelSelect.value = 'qwen-2.5-vl';

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

        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-file-check" style="font-size: 24px; color: #4CAF50;"></i>
                <span style="color: #4CAF50;">File uploaded successfully</span>
            </div>
        `;

        const userMessage = document.getElementById('userInput').value;
        const fileMessage = `📎 File: ${file.name}`;

        chatHistory.push({
            role: 'user',
            content: userMessage + '\n\nFile contents:\n' + data.text
        });

        appendMessage(userMessage, 'user');
        appendMessage(fileMessage, 'user-file');

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

    event.target.value = '';
}

function populateModelDropdown(models) {
    const modelSelect = document.getElementById('modelSelect');
    const headerModelSelect = document.getElementById('headerModelSelect');
    const searchButton = document.getElementById('searchEnabled');

    modelSelect.innerHTML = '';
    headerModelSelect.innerHTML = '';

    models.filter(model => {
        return !(model.model_spec && model.model_spec.offline === true);
    }).forEach(model => {
        const supportsReasoning = model.model_spec &&
                                 model.model_spec.capabilities &&
                                 model.model_spec.capabilities.supportsReasoning === true;

        const supportsWebSearch = model.model_spec &&
                                 model.model_spec.capabilities &&
                                 model.model_spec.capabilities.supportsWebSearch === true;

        const displayText = supportsReasoning ? `${model.id} - Reasoning` : model.id;

        const option = document.createElement('option');
        option.value = model.id;
        option.text = displayText;
        option.dataset.supportsWebSearch = supportsWebSearch || false;
        option.dataset.supportsReasoning = supportsReasoning || false;
        modelSelect.appendChild(option);

        const headerOption = document.createElement('option');
        headerOption.value = model.id;
        headerOption.text = displayText;
        headerOption.dataset.supportsWebSearch = supportsWebSearch || false;
        headerOption.dataset.supportsReasoning = supportsReasoning || false;
        headerModelSelect.appendChild(headerOption);
    });

    modelSelect.value = 'qwen-2.5-qwq-32b';
    headerModelSelect.value = 'qwen-2.5-qwq-32b';

    const updateSearchButtonVisibility = (dropdown) => {
        const selectedOption = dropdown.options[dropdown.selectedIndex];
        const supportsWebSearch = selectedOption.dataset.supportsWebSearch === 'true';
        searchButton.style.display = supportsWebSearch ? 'block' : 'none';
        searchButton.classList.remove('active');
    };

    modelSelect.addEventListener('change', function() {
        headerModelSelect.value = this.value;
        updateSearchButtonVisibility(this);
    });

    headerModelSelect.addEventListener('change', function() {
        modelSelect.value = this.value;
        updateSearchButtonVisibility(this);
    });

    updateSearchButtonVisibility(modelSelect);
}

async function startStream() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    const galleryInput = document.getElementById('galleryInput');
    const cameraInput = document.getElementById('cameraInput');
    let base64Image = "";

    console.log("Current chat history BEFORE starting stream:", JSON.stringify(chatHistory.map(m => ({
        role: m.role,
        contentPreview: m.content.substring(0, 30) + '...'
    }))));

    if (!message && !galleryInput.files.length && !cameraInput.files.length) {
        return;
    }

    const processImage = async (file) => {
        const isCameraPhoto = file.type.startsWith('image/') && file.name === 'image.jpg';
        if (isCameraPhoto || file.size > 2 * 1024 * 1024) {
            const resizedBlob = await resizeImage(file, 800, 600);
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

    if (galleryInput.files.length > 0) {
        await processImage(galleryInput.files[0]);
        galleryInput.value = '';
    } else if (cameraInput.files.length > 0) {
        await processImage(cameraInput.files[0]);
        cameraInput.value = '';
    } else {
        submitChat(message);
    }
    userInput.value = '';
}

async function submitChat(message, base64Image) {
    if (!message && !base64Image) return;
    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    lastCitations = null;

    console.log("BEFORE - Chat history contains:", chatHistory.length, "messages");

    if (message) {
        console.log(`Adding user message to chat history: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
        chatHistory.push({ role: 'user', content: message });
        console.log("Added user message to chat history");
    }

    botContentBuffer = "";

    const ragEnabled = document.getElementById('ragEnabled').checked;
    const knowledgeBase = document.getElementById('knowledgeBase').value;

    let enhancedSystemPrompt = systemPrompt;
    let retrievedContext = '';

    if (ragEnabled && knowledgeBase && message) {
        try {
            const retrievalMessage = appendMessage('Retrieving relevant context...', 'assistant', true);

            console.log(`Searching collection "${knowledgeBase}" for: ${message}`);
            const results = await searchCollection(knowledgeBase, message);

            if (results && results.length > 0) {
                retrievedContext = 'CONTEXT:\n';
                results.forEach((result, index) => {
                    retrievedContext += `---\n[${index + 1}] ${result.text}\n`;
                    if (result.metadata) {
                        retrievedContext += `Source: ${result.metadata.source || 'Unknown'}\n`;
                        if (result.metadata.filename) {
                            retrievedContext += `File: ${result.metadata.filename}\n`;
                        }
                    }
                    retrievedContext += `Relevance: ${(result.score * 100).toFixed(1)}%\n---\n\n`;
                });

                enhancedSystemPrompt = `${systemPrompt}\n\n${retrievedContext}\nUSER QUERY:\n${message}\n\nPlease use the context provided above to answer the user's query. If the context doesn't contain relevant information, rely on your general knowledge but acknowledge this fact. Maintain your existing personality and tone regardless of which knowledge source you use.`;

                console.log('Enhanced prompt with context from Vector Store');
            } else {
                console.log('No relevant context found in Vector Store');
            }

            retrievalMessage.remove();
        } catch (error) {
            console.error('Error retrieving context:', error);
        }
    }

    const messages = [
        { role: 'system', content: enhancedSystemPrompt }
    ];

    chatHistory.forEach(msg => {
        console.log(`Processing message for API: ${msg.role}`, msg.content.substring(0, 50) + '...');

        if (msg.role === 'user' && msg.content === message) {
            console.log("Skipping current user message (will add it separately)");
            return;
        }

        if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'assistant') {
            messages.push({ role: 'assistant', content: msg.content });
            console.log("✓ Added assistant message to API request");
        }
    });

    if (message) {
        messages.push({ role: 'user', content: message });
    }

    if (base64Image) {
        messages.push({
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: base64Image } }]
        });
    }

    appendMessage(message, 'user');
    if (base64Image) {
        appendMessage(`<img src="${base64Image}" alt="User Uploaded Image" style="max-width: 80%; height: auto;" />`, 'user');
    }

    document.getElementById('imagePreview').innerHTML = '';
    const botMessage = appendMessage('', 'assistant', true);
    botContentBuffer = "";
    fetchChatResponse(messages, botMessage);
}


async function fetchChatResponse(messages, botMessage) {
    showLoading(true);
    try {
        const currentModel = document.getElementById('modelSelect').value;
        console.log('Current model:', currentModel);

        const searchButton = document.getElementById('searchEnabled');
        const searchEnabled = searchButton && searchButton.classList.contains('active');
        console.log('Web search enabled:', searchEnabled);

        const maxTokens = parseInt(localStorage.getItem('maxTokens') || '4000');
        const temperature = parseFloat(localStorage.getItem('temperature') || '0.7');

        const requestBody = {
            messages: messages,
            model: currentModel,
            max_completion_tokens: maxTokens,
            temperature: temperature,
            stream: true
        };

        if (searchEnabled) {
            requestBody.web_search = "on";
        }

        console.log('Sending chat request:', {
            model: requestBody.model,
            web_search: requestBody.web_search,
            messageCount: messages.length
        });

        console.log('BEFORE - Chat history contains:', chatHistory.length, 'messages');
        console.log('Chat history roles:', chatHistory.map(msg => msg.role));

        const response = await fetch('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log('Response status:', response.status);
        if (!response.ok) {
            showLoading(false);
            console.error('Response error:', await response.text());
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        botContentBuffer = "";

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const data = line.slice(5).trim();
                if (!data) continue;

                if (data === '[DONE]') {
                    showLoading(false);

                    if (botContentBuffer && botContentBuffer.trim() !== '') {
                        console.log("💬 Adding assistant message to history:", botContentBuffer.substring(0, 30) + "...");

                        chatHistory.push({
                            role: 'assistant',
                            content: botContentBuffer
                        });

                        console.log("✅ Assistant message added to chat history");
                        console.log("AFTER - Chat history updated, now contains:", chatHistory.length, "messages");
                        console.log("Roles in history:", chatHistory.map(msg => msg.role));
                    }

                    Prism.highlightAll();
                    return;
                }

                try {
                    const parsed = JSON.parse(data);

                    if (parsed.error) {
                        appendMessage(`Error: ${parsed.error}`, 'error');
                        showLoading(false);
                        return;
                    }

                    if (parsed.content) {
                        botContentBuffer += parsed.content;
                        botMessage.innerHTML = formatContent(botContentBuffer);
                        Prism.highlightAll();
                        scrollToBottom();
                    }
                } catch (e) {
                    if (data !== '[DONE]') {
                        console.error('Error parsing chunk:', e);
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

function formatCitations(citations) {
    if (!citations || !citations.length || citations.every(c => !c.title && !c.url)) return '';

    let citationsHtml = '\n\n<div class="citations-section">';
    citationsHtml += `<div class="citations-header" onclick="toggleCitations(this)">
        <h3>Web Search Results (${citations.length})</h3>
        <span class="toggle-icon"></span>
    </div><div class="citations-content">`;
    citations.forEach((citation, index) => {
        if (citation.title && citation.url) {
            citationsHtml += `
                <div class="citation-item">
                    <div class="citation-number">[${index + 1}]</div>
                    <div class="citation-content">
                        <a href="${citation.url}" class="citation-title" target="_blank">${citation.title}</a>
                        ${citation.content ? `<div class="citation-snippet">${citation.content}</div>` : ''}
                        <div class="citation-url">${citation.url}</div>
                        ${citation.published_date ? `<div class="citation-date">Published: ${citation.published_date}</div>` : ''}
                    </div>
                </div>`;
        }
    });
    citationsHtml += '</div></div>';
    return citationsHtml;
}

function toggleCitations(header) {
    header.classList.toggle('expanded');
    header.nextElementSibling.classList.toggle('expanded');
}

window.toggleCitations = toggleCitations;

function formatContent(content) {
    let formatted = content;

    if (/<think>\n?([\s\S]+?)<\/think>/g.test(content)) {
        formatted = content.replace(/<think>\n?([\s\S]+?)<\/think>/g, (match, content) => {
            return `<div class="reasoning-content"><strong>Reasoning:</strong><br>${content.trim()}</div>`;
        });
    }

    formatted = formatted.replace(/```(\w*)\n?([\s\S]+?)\n```/g, (match, lang, code) => {
        const trimmedCode = code.trim();
        const highlightedCode = Prism.highlight(
            trimmedCode,
            Prism.languages[lang] || Prism.languages.plain,
            lang || 'plaintext'
        );
        return `<pre class="code-block"><code class="language-${lang || 'plaintext'}">${highlightedCode}</code></pre>`;
    });

    const codeBlockPattern = /<pre class="code-block">[\s\S]*?<\/pre>/g;
    const codeBlocks = [];
    formatted = formatted.replace(codeBlockPattern, (match) => {
        codeBlocks.push(match);
        return `<!-- code-block-${codeBlocks.length - 1} -->`;
    });

    formatted = formatted
        .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
        .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, (match, code) => {
            return `<code class="inline-code">${code}</code>`;
        });

    formatted = formatted.split('\n').map(line => line.trim()).join('<br>');

    formatted = formatted.replace(/<!-- code-block-(\d+) -->/g, (match, index) => {
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

function initSettingsPanel() {
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.querySelector('.settings-panel');

    settingsToggle.addEventListener('click', () => {
        settingsPanel.classList.toggle('visible');
    });
}

function clearChatHistory() {
    chatHistory.length = 0;
    document.getElementById('chatBox').innerHTML = '';

    try {
        localStorage.removeItem('chatHistory');
        console.log("🧹 Chat history cleared from localStorage");
    } catch (e) {
        console.warn("Could not clear chat history from localStorage:", e);
    }
}

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
            const formattedContent = content.replace(/\r\n|\r|\n/g, '\n');
            finalPrompt += `<${tag}>\n${formattedContent}\n</${tag}>\n`;
        }
    }

    document.getElementById('userInput').value = finalPrompt.replace(/\n\n+/g, '\n');
    togglePromptComposer();
}

function showChatContext() {
    let contextInfo = "In the context window, I can see the following messages:\n\n";

    const roleCounts = {
        user: 0,
        assistant: 0,
        system: 0
    };

    console.log("🔍 CONTEXT DEBUG - Chat history contains:", chatHistory.length, "messages");
    console.log("🔍 CONTEXT DEBUG - Full details:", JSON.stringify(chatHistory.map(m => {
        roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
        return {
            role: m.role,
            contentPreview: typeof m.content === 'string' ? m.content.substring(0, 30) + '...' : '[complex content]'
        };
    })));

    chatHistory.forEach((msg, index) => {
        if (msg.role !== 'system') {
            const preview = typeof msg.content === 'string'
                ? msg.content.substring(0, 100)
                : JSON.stringify(msg.content).substring(0, 100);
            contextInfo += `[${index}] ${msg.role}: ${preview}${preview.length > 99 ? '...' : ''}\n\n`;
        }
    });

    if (chatHistory.length <= 1) {
        contextInfo += "No conversation history found. Try sending a few messages first.";
    }

    contextInfo += `\n--- Summary ---\nTotal messages: ${chatHistory.length}\n`;
    contextInfo += `User messages: ${roleCounts.user || 0}\n`;
    contextInfo += `Assistant messages: ${roleCounts.assistant || 0}\n`;
    contextInfo += `System messages: ${roleCounts.system || 0}\n`;

    appendMessage(contextInfo, 'system');

    console.table(chatHistory.map((msg, i) => ({
        index: i,
        role: msg.role,
        preview: typeof msg.content === 'string' ?
            msg.content.substring(0, 30) + '...' :
            JSON.stringify(msg.content).substring(0, 30) + '...'
    })));
}

window.toggleWebSearch = toggleWebSearch;
window.startStream = startStream;
window.saveSettings = saveSettings;
window.clearChatHistory = clearChatHistory;
window.togglePromptComposer = togglePromptComposer;
window.clearFields = clearFields;
window.transferPrompt = transferPrompt;
window.showChatContext = showChatContext;

function toggleWebSearch(button) {
    button.classList.toggle('active');
    console.log('Search toggled:', button.classList.contains('active'));
}

window.toggleWebSearch = toggleWebSearch;
window.startStream = startStream;
window.saveSettings = saveSettings;
window.clearChatHistory = clearChatHistory;
window.togglePromptComposer = togglePromptComposer;
window.clearFields = clearFields;
window.transferPrompt = transferPrompt;

function toggleTextSize(size) {
    const container = document.querySelector('.container');
    if (size === 'big') {
        container.classList.add('big-text');
    } else {
        container.classList.remove('big-text');
    }
    localStorage.setItem('textSize', size);
}

window.addEventListener('load', () => {
    fetchModels();
    initSettingsPanel();
    initEventListeners();

    const savedSize = localStorage.getItem('textSize') || 'small';
    document.getElementById('textSize').value = savedSize;
    toggleTextSize(savedSize);
});

window.toggleTextSize = toggleTextSize;

function displayFullChatHistory() {
    console.table(chatHistory.map((msg, index) => ({
        index,
        role: msg.role,
        contentType: typeof msg.content,
        preview: typeof msg.content === 'string'
            ? (msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content)
            : JSON.stringify(msg.content).substring(0, 50) + '...'
    })));

    window.currentChatHistory = [...chatHistory];

    let historyText = "## COMPLETE CHAT HISTORY ##\n\n";

    chatHistory.forEach((msg, index) => {
        const content = typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content, null, 2);

        historyText += `[${index}] ${msg.role.toUpperCase()}:\n${content}\n\n---\n\n`;
    });

    appendMessage(historyText, 'system');
}

window.displayFullChatHistory = displayFullChatHistory;