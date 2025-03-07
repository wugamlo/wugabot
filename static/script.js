let currentStream = null;
const chatHistory = [];
let botContentBuffer = "";
let lastCitations = null; // Added to store the latest citations

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

// Vector Store Management API functions
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

// Populate Knowledge Base dropdown
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

// Load settings and populate character dropdown when the page loads
window.addEventListener('load', () => {
    fetchModels();
    populateCharacterDropdown();
    
    // Load saved settings
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
    
    // Setup RAG toggle
    const ragEnabledToggle = document.getElementById('ragEnabled');
    const knowledgeBaseContainer = document.getElementById('knowledgeBaseContainer');
    
    ragEnabledToggle.checked = savedRagEnabled;
    knowledgeBaseContainer.style.display = savedRagEnabled ? 'block' : 'none';
    
    // Populate knowledge base dropdown if RAG is enabled
    if (savedRagEnabled) {
        populateKnowledgeBaseDropdown();
        
        if (savedKnowledgeBase) {
            // Wait for dropdown to be populated
            setTimeout(() => {
                document.getElementById('knowledgeBase').value = savedKnowledgeBase;
            }, 500);
        }
    }
    
    // Add event listener for RAG toggle
    ragEnabledToggle.addEventListener('change', function() {
        knowledgeBaseContainer.style.display = this.checked ? 'block' : 'none';
        if (this.checked) {
            populateKnowledgeBaseDropdown();
        }
        localStorage.setItem('ragEnabled', this.checked);
    });
    
    // Add event listener for knowledge base selection
    document.getElementById('knowledgeBase').addEventListener('change', function() {
        localStorage.setItem('knowledgeBase', this.value);
    });
    
    // Add event listener for temperature slider
    const temperatureSlider = document.getElementById('temperature');
    temperatureSlider.addEventListener('input', function() {
        document.getElementById('temperatureValue').textContent = this.value;
    });
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
            saveSettings(); // Automatically save when character is selected
        }
    });
}
// Function to save all settings
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
    
    // Show feedback to user
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
        const headerModelSelect = document.getElementById('headerModelSelect');
        const previousModel = modelSelect.value;
        
        // Update both model selectors to ensure consistency
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
    const headerModelSelect = document.getElementById('headerModelSelect');
    const searchButton = document.getElementById('searchEnabled');
    
    // Clear both dropdowns
    modelSelect.innerHTML = '';
    headerModelSelect.innerHTML = '';

    // Populate both dropdowns with the same models
    models.forEach(model => {
        // For settings dropdown
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.dataset.supportsWebSearch = model.supportsWebSearch || false;
        modelSelect.appendChild(option);
        
        // For header dropdown
        const headerOption = document.createElement('option');
        headerOption.value = model.id;
        headerOption.text = model.id;
        headerOption.dataset.supportsWebSearch = model.supportsWebSearch || false;
        headerModelSelect.appendChild(headerOption);
    });
    
    // Set the default value for both dropdowns
    modelSelect.value = 'qwen-2.5-qwq-32b';
    headerModelSelect.value = 'qwen-2.5-qwq-32b';

    // Function to update search button visibility
    const updateSearchButtonVisibility = (dropdown) => {
        const selectedOption = dropdown.options[dropdown.selectedIndex];
        const supportsWebSearch = selectedOption.dataset.supportsWebSearch === 'true';
        searchButton.style.display = supportsWebSearch ? 'block' : 'none';
        searchButton.classList.remove('active');
    };

    // Keep the dropdowns in sync
    modelSelect.addEventListener('change', function() {
        headerModelSelect.value = this.value;
        updateSearchButtonVisibility(this);
    });

    headerModelSelect.addEventListener('change', function() {
        modelSelect.value = this.value;
        updateSearchButtonVisibility(this);
    });

    // Trigger initial visibility
    updateSearchButtonVisibility(modelSelect);
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
async function submitChat(message, base64Image) {
    if (!message && !base64Image) return;
    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    // Clear lastCitations at the start of each new message
    lastCitations = null;

    if (message) {
        chatHistory.push({ role: 'user', content: message });
    }

    // Check if RAG is enabled
    const ragEnabled = document.getElementById('ragEnabled').checked;
    const knowledgeBase = document.getElementById('knowledgeBase').value;
    
    let enhancedSystemPrompt = systemPrompt;
    let retrievedContext = '';
    
    // If RAG is enabled and a knowledge base is selected, fetch context
    if (ragEnabled && knowledgeBase && message) {
        try {
            // Show a temporary message to indicate retrieval is in progress
            const retrievalMessage = appendMessage('Retrieving relevant context...', 'assistant', true);
            
            console.log(`Searching collection "${knowledgeBase}" for: ${message}`);
            const results = await searchCollection(knowledgeBase, message);
            
            if (results && results.length > 0) {
                // Format retrieved context
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
                
                // Format the enhanced system prompt
                enhancedSystemPrompt = `${systemPrompt}\n\n${retrievedContext}\nUSER QUERY:\n${message}\n\nPlease use the context provided above to answer the user's query. If the context doesn't contain relevant information, rely on your general knowledge but acknowledge this fact. Maintain your existing personality and tone regardless of which knowledge source you use.`;
                
                console.log('Enhanced prompt with context from Vector Store');
            } else {
                console.log('No relevant context found in Vector Store');
            }
            
            // Remove the temporary retrieval message
            retrievalMessage.remove();
        } catch (error) {
            console.error('Error retrieving context:', error);
        }
    }

    const messages = [
        { role: 'system', content: enhancedSystemPrompt },
        ...chatHistory.slice(0, -1) // Exclude the last user message since we're using the enhanced prompt
    ];

    if (message) {
        messages.push({ role: 'user', content: [{ type: 'text', text: message }] });
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
// File input handlers are already set up for galleryInput and cameraInput

// Fetch response from chat
async function fetchChatResponse(messages, botMessage) {
    showLoading(true);
    try {
        const searchButton = document.getElementById('searchEnabled');
        const searchEnabled = searchButton && searchButton.classList.contains('active');
        console.log('Web search enabled:', searchEnabled);
        
        // Get user settings
        const maxTokens = parseInt(localStorage.getItem('maxTokens') || '4000');
        const temperature = parseFloat(localStorage.getItem('temperature') || '0.7');
        
        // Build the request with updated parameter names
        const requestBody = {
            messages: messages,
            model: document.getElementById('modelSelect').value,
            max_completion_tokens: maxTokens, // Updated to use max_completion_tokens instead of max_tokens
            temperature: temperature,
            stream: true
        };
        
        // Only add web search parameter when explicitly enabled
        if (searchEnabled) {
            requestBody.web_search = "on";
        }
        
        console.log('Sending chat request:', {
            model: requestBody.model,
            web_search: requestBody.web_search,
            messageCount: messages.length
        });
        
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
        
        // Process streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let reasoningContent = null;
        
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
                    // Final check to ensure all content is displayed before completing
                    if (lastCitations?.length > 0 && lastCitations.some(c => c.title && c.url)) {
                        const finalContent = formatContent(botContentBuffer);
                        botMessage.innerHTML = finalContent + formatCitations(lastCitations);
                    }
                    
                    showLoading(false);
                    chatHistory.push({ 
                        role: 'assistant', 
                        content: botContentBuffer,
                        reasoning_content: reasoningContent // Store reasoning content if available
                    });
                    Prism.highlightAll();
                    return;
                }
                
                try {
                    const parsed = JSON.parse(data);
                    
                    // Log important parts of the response for debugging
                    if (parsed.error || parsed.venice_parameters) {
                        // Only log a portion of potentially very large responses to avoid console errors
                        const truncatedResponse = {...parsed};
                        if (parsed.venice_parameters && parsed.venice_parameters.web_search_citations) {
                            truncatedResponse.venice_parameters = {
                                ...parsed.venice_parameters,
                                web_search_citations: parsed.venice_parameters.web_search_citations.slice(0, 2)
                            };
                        }
                        console.log('Parsed response chunk:', truncatedResponse);
                    }
                    
                    // Handle errors
                    if (parsed.error) {
                        appendMessage(`Error: ${parsed.error}`, 'error');
                        showLoading(false);
                        return;
                    }
                    
                    // Handle content from different parts of the response
                    if (parsed.content) {
                        botContentBuffer += parsed.content;
                    }
                    
                    // Handle delta if present (for streaming responses)
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                        const delta = parsed.choices[0].delta;
                        
                        // Append content from delta
                        if (delta.content) {
                            botContentBuffer += delta.content;
                        }
                        
                        // Check for reasoning content
                        if (delta.reasoning_content) {
                            reasoningContent = reasoningContent || '';
                            reasoningContent += delta.reasoning_content;
                        }
                    }
                    
                    // Handle citations and other venice parameters
                    if (parsed.venice_parameters) {
                        // Get citations if available
                        const citationsInResponse = parsed.venice_parameters.web_search_citations;
                        if (citationsInResponse) {
                            console.log('Found citations:', citationsInResponse);
                            lastCitations = citationsInResponse;
                        }
                        
                        // Check for reasoning content in venice_parameters
                        if (parsed.venice_parameters.reasoning_content) {
                            reasoningContent = parsed.venice_parameters.reasoning_content;
                        }
                    }
                    
                    // Update the message with all available content
                    let updatedContent = formatContent(botContentBuffer);
                    
                    // Add reasoning content if available and not already in the content
                    if (reasoningContent && !botContentBuffer.includes(reasoningContent)) {
                        updatedContent = updatedContent + 
                            `<div class="reasoning-content"><strong>Reasoning:</strong><br>${reasoningContent}</div>`;
                    }
                    
                    // Add citations if available
                    if (lastCitations?.length > 0 && lastCitations.some(c => c.title && c.url)) {
                        botMessage.innerHTML = updatedContent + formatCitations(lastCitations);
                    } else {
                        botMessage.innerHTML = updatedContent;
                    }
                    
                    Prism.highlightAll();
                    scrollToBottom();
                } catch (e) {
                    if (data !== '[DONE]') {
                        // Only log a portion of potentially large data to avoid console overflow
                        const truncatedData = data.length > 500 ? data.substring(0, 500) + '...' : data;
                        console.error('Error parsing chunk:', e, 'Data:', truncatedData);
                        
                        // Try to recover and continue - don't let a parsing error break the entire response
                        if (data.includes('"content":')) {
                            try {
                                // Simple extraction of content if available
                                const contentMatch = /"content":"([^"]*)"/.exec(data);
                                if (contentMatch && contentMatch[1]) {
                                    botContentBuffer += contentMatch[1];
                                    botMessage.innerHTML = formatContent(botContentBuffer);
                                }
                            } catch (extractError) {
                                // Silent fail for extraction attempt
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Stream error:', error);
        appendMessage('Failed to connect to chat service. Please try again.', 'error');
        chatHistory.push({ role: 'assistant', content: botContentBuffer });
    } finally {
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

// Export the toggle function for global access
window.toggleCitations = toggleCitations;

function formatContent(content) {
    // First handle reasoning content by directly using the API's reasoning_content field
    // (this is handled separately in the fetchChatResponse function now)
    let formatted = content;
    
    // Fallback for any <think> tags that might still be in the content
    if (/<think>\n?([\s\S]+?)<\/think>/g.test(content)) {
        formatted = content.replace(/<think>\n?([\s\S]+?)<\/think>/g, (match, content) => {
            return `<div class="reasoning-content"><strong>Reasoning:</strong><br>${content.trim()}</div>`;
        });
    }
    
    // Format code blocks - improved to handle language specification better, with special handling for SVG/XML
    formatted = formatted.replace(/```(svg|xml|\w*)\n?([\s\S]+?)\n```/g, (match, lang, code) => {
        // Store the trimmed code
        const trimmedCode = code.trim();
        
        // Special handling for SVG and XML
        const languageToUse = lang === 'svg' ? 'xml' : lang || 'plaintext';
        
        // Log code block processing for debugging
        console.log(`Processing code block [${lang}], length: ${trimmedCode.length}`);
        
        // Use Prism for highlighting if available for the language
        const highlightedCode = Prism.highlight(
            trimmedCode,
            Prism.languages[languageToUse] || Prism.languages.plain,
            languageToUse
        );
        
        return `<pre class="code-block"><code class="language-${languageToUse}">${highlightedCode}</code></pre>`;
    });

    // Store code blocks to prevent them from being affected by markdown processing
    const codeBlockPattern = /<pre class="code-block">[\s\S]*?<\/pre>/g;
    const codeBlocks = [];
    formatted = formatted.replace(codeBlockPattern, (match) => {
        codeBlocks.push(match);
        return `<!-- code-block-${codeBlocks.length - 1} -->`;
    });
    
    // Log code blocks count for debugging
    console.log("Extracted code blocks:", codeBlocks.length);

    // Process standard markdown elements in more consistent way
    formatted = formatted
        // Headers - ensure they're properly matched at line start
        .replace(/^# (.*?)$/gm, '<h1>$1</h1>') 
        .replace(/^## (.*?)$/gm, '<h2>$1</h2>')  
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        // Lists - better handling of nested lists
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
        // Bold and italics
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // Inline code - improved to prevent nested matching
        .replace(/`([^`]+)`/g, (match, code) => {
            return `<code class="inline-code">${code}</code>`;
        });
    
    // Handle line breaks in a more standard way
    formatted = formatted.split('\n').map(line => line.trim()).join('<br>');

    // Restore code blocks
    formatted = formatted.replace(/<!-- code-block-(\d+) -->/g, (match, index) => {
        return codeBlocks[parseInt(index)];
    });
    
    // Debug info
    console.log("Formatting complete, result length:", formatted.length);
    console.log("Formatted content length:", formatted.length);
    console.log("Content contains code blocks:", content.includes('```'));
    console.log("Formatted content has code blocks:", formatted.includes('<pre class="code-block">'));

    return formatted;
}

function appendMessage(content, role, returnElement = false) {
    const chatBox = document.getElementById('chatBox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    if (typeof content === 'string') {
        // Only escape if NOT containing SVG or image tags or code blocks
        if (!content.startsWith('<img') && !content.includes('<svg') && !content.includes('```')) {
            content = content
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&lt;(\/?(?:instructions|format|context|examples|warnings))&gt;/g, '<span class="xml-tag">&lt;$1&gt;</span>')
                .replace(/\n/g, '<br>');
        } else if (!content.startsWith('<img')) {
            // Preserve code blocks but encode non-code content
            content = content.replace(/\n/g, '<br>');
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
window.saveSettings = saveSettings;
window.clearChatHistory = clearChatHistory;
window.togglePromptComposer = togglePromptComposer;
window.clearFields = clearFields;
window.transferPrompt = transferPrompt;

function toggleWebSearch(button) {
    button.classList.toggle('active');
    console.log('Search toggled:', button.classList.contains('active'));
}

// Initialize global functions
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

    // Restore text size preference
    const savedSize = localStorage.getItem('textSize') || 'small';
    document.getElementById('textSize').value = savedSize;
    toggleTextSize(savedSize);
});

// Export the function for global access
window.toggleTextSize = toggleTextSize;