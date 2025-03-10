/**
 * WugaBot - Main Application Script
 * 
 * This file contains the core functionality for the WugaBot chat interface,
 * including message handling, API communication, and UI manipulation.
 * 
 * @author WugaBot Team
 * @version 1.0
 */

/** @type {Object|null} - Tracks the current streaming response */
let currentStream = null;

/** @type {Array} - Stores the chat history (user and assistant messages) */
const chatHistory = [];

/** @type {string} - Temporary buffer for storing assistant responses during streaming */
let botContentBuffer = "";

/** @type {Array|null} - Stores citations from the latest response with web search */
let lastCitations = null;

/**
 * Fetches available AI models from the server
 * Populates dropdown menus with the retrieved models
 * @async
 * @returns {Promise<void>}
 */
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

/**
 * Vector Store Management API functions
 * These functions handle interaction with the external vector database for RAG functionality
 */

/**
 * Fetches all available vector store collections from the API
 * @async
 * @returns {Promise<Array>} Array of collection names
 */
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

/**
 * Searches a specific vector store collection for relevant results
 * @async
 * @param {string} collectionName - Name of the collection to search
 * @param {string} query - The search query
 * @param {number} [limit=5] - Maximum number of results to return
 * @returns {Promise<Array>} Search results with relevance scores and text content
 */
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

/**
 * Populates the knowledge base dropdown with available collections
 * @async
 * @returns {Promise<void>}
 */
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

    // Load chat history from localStorage if available
    try {
        const savedChatHistory = localStorage.getItem('chatHistory');
        if (savedChatHistory) {
            const parsedHistory = JSON.parse(savedChatHistory);
            if (Array.isArray(parsedHistory)) {
                chatHistory.length = 0; // Clear existing history
                parsedHistory.forEach(msg => chatHistory.push(msg));
                console.log("📂 Loaded chat history from localStorage with", chatHistory.length, "messages");
                
                // Restore chat display from history
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

/**
 * Resizes an image file to fit within specified dimensions while maintaining aspect ratio
 * Helps optimize large images for upload and processing
 * 
 * @param {File} file - The image file to resize
 * @param {number} maxWidth - Maximum width constraint in pixels
 * @param {number} maxHeight - Maximum height constraint in pixels
 * @returns {Promise<Blob>} - A promise that resolves with the resized image blob
 */
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

/**
 * Handles image upload from gallery or camera, shows preview and switches model to VL if needed
 * 
 * @param {HTMLInputElement} input - The file input element containing the image
 * @returns {void}
 */
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

    // Filter out offline models and populate both dropdowns with the same models
    models.filter(model => {
        // Filter out models where offline is true
        return !(model.model_spec && model.model_spec.offline === true);
    }).forEach(model => {
        // Get reasoning capability
        const supportsReasoning = model.model_spec && 
                                 model.model_spec.capabilities && 
                                 model.model_spec.capabilities.supportsReasoning === true;

        // Get web search capability
        const supportsWebSearch = model.model_spec && 
                                 model.model_spec.capabilities && 
                                 model.model_spec.capabilities.supportsWebSearch === true;

        // Create display text with reasoning indicator
        const displayText = supportsReasoning ? `${model.id} - Reasoning` : model.id;

        // For settings dropdown
        const option = document.createElement('option');
        option.value = model.id;
        option.text = displayText;
        option.dataset.supportsWebSearch = supportsWebSearch || false;
        option.dataset.supportsReasoning = supportsReasoning || false;
        modelSelect.appendChild(option);

        // For header dropdown
        const headerOption = document.createElement('option');
        headerOption.value = model.id;
        headerOption.text = displayText;
        headerOption.dataset.supportsWebSearch = supportsWebSearch || false;
        headerOption.dataset.supportsReasoning = supportsReasoning || false;
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

    // Log current chat history state before processing
    console.log("Current chat history BEFORE starting stream:", JSON.stringify(chatHistory.map(m => ({
        role: m.role,
        contentPreview: m.content.substring(0, 30) + '...'
    }))));

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

/**
 * Submits a chat message to the AI model, optionally with an image attachment
 * Handles RAG context retrieval if enabled and formats the API request
 * 
 * @async
 * @param {string} message - The user's text message
 * @param {string} [base64Image] - Optional base64-encoded image data
 * @returns {Promise<void>}
 */
async function submitChat(message, base64Image) {
    if (!message && !base64Image) return;
    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    // Clear lastCitations at the start of each new message
    lastCitations = null;

    console.log("BEFORE - Chat history contains:", chatHistory.length, "messages");
    
    // Store message without image in chat history
    if (message) {
        // Ensure consistent format for user messages
        chatHistory.push({ 
            role: 'user', 
            content: message 
        });
        console.log("Added user message to chat history");
    }
    
    // Reset botContentBuffer for the new message
    botContentBuffer = "";

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

    // Use only necessary history for message construction
    // First create the system message
    const messages = [
        { role: 'system', content: enhancedSystemPrompt }
    ];
    
    // Then add all history with consistent formatting for the API
    chatHistory.forEach(msg => {
        // Make sure we properly log what's happening in the history
        console.log(`Processing message for API: ${msg.role}`, msg.content.substring(0, 50) + '...');
        
        // Skip the current user message (it will be added separately)
        if (msg.role === 'user' && msg.content === message) {
            console.log("Skipping current user message (will add it separately)");
            return;
        }
        
        if (msg.role === 'user') {
            // Format user messages for the API
            messages.push({ 
                role: 'user', 
                content: [{ type: 'text', text: msg.content }] 
            });
        } else if (msg.role === 'assistant') {
            // Format assistant messages with content array format
            messages.push({ 
                role: 'assistant', 
                content: [{ type: 'text', text: msg.content }] 
            });
            console.log("✓ Added assistant message to API request");
        }
    });

    // Add current user message with proper formatting for the API
    if (message) {
        messages.push({ role: 'user', content: [{ type: 'text', text: message }] });
    }

    // If image present, add it to the API request but NOT to chatHistory
    if (base64Image) {
        messages.push({
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: base64Image } }]
        });
    }

    // Display in UI
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

/**
 * Fetches a response from the chat API based on the provided messages
 * Handles streaming, error handling, and updating the chat history
 * 
 * @async
 * @param {Array} messages - Array of message objects to send to the API
 * @param {HTMLElement} botMessage - DOM element where the response will be displayed
 * @returns {Promise<void>}
 */
async function fetchChatResponse(messages, botMessage) {
    showLoading(true);
    try {
        // Store the current model for debugging purposes
        const currentModel = document.getElementById('modelSelect').value;
        console.log('Current model:', currentModel);
        
        const searchButton = document.getElementById('searchEnabled');
        const searchEnabled = searchButton && searchButton.classList.contains('active');
        console.log('Web search enabled:', searchEnabled);

        // Get user settings
        const maxTokens = parseInt(localStorage.getItem('maxTokens') || '4000');
        const temperature = parseFloat(localStorage.getItem('temperature') || '0.7');

        // Build the request with updated parameter names
        const requestBody = {
            messages: messages,
            model: currentModel,
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
        
        // DEBUG: Log the message history being sent
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

        // Clear the buffer at the start of streaming
        botContentBuffer = "";
        
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

                    // ALWAYS add the assistant's response to the chat history when streaming is done
                    if (botContentBuffer && botContentBuffer.trim() !== '') {
                        console.log("💬 Adding assistant message to history:", botContentBuffer.substring(0, 30) + "...");
                        
                        // Add assistant message to chat history - CRITICALLY IMPORTANT
                        chatHistory.push({
                            role: 'assistant',
                            content: botContentBuffer
                        });
                        
                        // Save the updated chat history to localStorage
                        try {
                            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                            console.log("✅ Chat history saved to localStorage with", chatHistory.length, "messages");
                        } catch (e) {
                            console.warn("Could not save chat history to localStorage:", e);
                        }
                        
                        console.log("✅ Assistant message added to chat history");
                        console.log("AFTER - Chat history updated, now contains:", chatHistory.length, "messages");
                        console.log("Roles in history:", chatHistory.map(msg => msg.role));
                        
                        // Debug - print what the next request will include
                        let nextContextSummary = chatHistory.map((msg, i) => `[${i}] ${msg.role}: ${msg.content.substring(0, 20)}...`).join('\n');
                        console.log("Next API request will include:\n", nextContextSummary);
                    }
                    
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
        
        // Even on error, add whatever assistant content we received
        if (botContentBuffer && botContentBuffer.trim() !== '') {
            chatHistory.push({
                role: 'assistant',
                content: botContentBuffer
            });
            console.log("✅ Assistant message added during error recovery");
        }
    } finally {
        showLoading(false);
        
        // ALWAYS add the assistant's response to the chat history when streaming is done
        if (botContentBuffer && botContentBuffer.trim() !== '') {
            console.log("💬 Adding assistant message to history:", botContentBuffer.substring(0, 30) + "...");
            
            // Add assistant message to chat history - CRITICALLY IMPORTANT
            chatHistory.push({
                role: 'assistant',
                content: botContentBuffer
            });
            
            // Save the updated chat history to localStorage
            try {
                localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                console.log("✅ Chat history saved to localStorage with", chatHistory.length, "messages");
            } catch (e) {
                console.warn("Could not save chat history to localStorage:", e);
            }
            
            console.log("✅ Assistant message added to chat history");
        }
        
        // Log the final chat history state
        console.log("FINAL chat history contains:", chatHistory.length, "messages");
        console.log("FINAL chat history roles:", chatHistory.map(msg => msg.role));
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

/**
 * Formats the raw text content from the AI into properly formatted HTML
 * Handles markdown formatting, code blocks, reasoning content, and more
 * 
 * @param {string} content - Raw text content from the AI
 * @returns {string} HTML-formatted content ready for display
 */
/**
 * Formats the raw text content from the AI into properly formatted HTML
 * Handles markdown formatting, code blocks, reasoning content, visualizations and more
 * 
 * @param {string} content - Raw text content from the AI
 * @returns {string} HTML-formatted content ready for display
 */
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

    // Check for visualization requests and process them
    formatted = formatted.replace(/<generate_visualization[\s\S]+?type="([^"]+)"[\s\S]+?data="([\s\S]+?)"[\s\S]+?<\/generate_visualization>/g, 
        (match, type, dataStr) => {
            try {
                console.log("Visualization request detected:", type);
                console.log("Raw data string:", dataStr.substring(0, 100));
                
                // Set up default data structures based on visualization type
                let data;
                
                if (type === "chart") {
                    data = {
                        chart_type: "bar",
                        title: "Sample Chart",
                        labels: ["A", "B", "C"],
                        values: [10, 20, 30]
                    };
                } else if (type === "diagram") {
                    data = {
                        diagram_type: "flowchart",
                        elements: [
                            { text: "Start" },
                            { text: "Decision" },
                            { text: "End" }
                        ]
                    };
                } else if (type === "drawing") {
                    data = {
                        description: "A simple drawing"
                    };
                }
                
                // Try to parse the provided data
                try {
                    // First, replace escaped quotes and other problematic characters
                    let cleanedDataStr = dataStr
                        .replace(/\\"/g, '"')
                        .replace(/\\\\"/g, '\\"')
                        .replace(/&quot;/g, '"')
                        .replace(/\\\\/g, '\\')
                        .replace(/\\n/g, ' ')
                        .replace(/\\r/g, '')
                        .replace(/\n/g, ' ')
                        .replace(/\r/g, '');
                    
                    // Additional cleanup for malformed JSON
                    cleanedDataStr = cleanedDataStr.trim();
                    
                    // Remove any HTML entities that might have been added
                    cleanedDataStr = cleanedDataStr
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&');
                    
                    console.log("Cleaned data string:", cleanedDataStr.substring(0, 100));
                    
                    // Try parsing if it looks like JSON
                    if (cleanedDataStr.startsWith('{') && cleanedDataStr.endsWith('}')) {
                        try {
                            const parsedData = JSON.parse(cleanedDataStr);
                            // Only update properties that exist in parsedData
                            Object.keys(parsedData).forEach(key => {
                                if (parsedData[key] !== undefined) {
                                    data[key] = parsedData[key];
                                }
                            });
                            console.log("Successfully parsed and merged JSON data");
                        } catch (innerError) {
                            console.warn("JSON parse error, using default data:", innerError.message);
                        }
                    } else {
                        console.warn("Data string doesn't look like valid JSON, using defaults");
                    }
                } catch (parseError) {
                    console.warn("Using default data due to parsing error:", parseError.message);
                }
                
                // Create a placeholder for the visualization with a loading indicator
                const placeholderId = `viz-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                
                // Call the visualization generation function
                generateVisualization(type, data, placeholderId);
                
                // Return a placeholder that will be updated when the visualization is ready
                return `<div id="${placeholderId}" class="visualization-placeholder">
                    <div class="loading-dots"></div>
                    <div>Generating ${type} visualization...</div>
                </div>`;
            } catch (e) {
                console.error('Error processing visualization tag:', e, 'Data:', dataStr.substring(0, 100));
                return `<div class="error-message">Error generating visualization: ${e.message}</div>`;
            }
        });

    // Format code blocks - improved to handle language specification better
    formatted = formatted.replace(/```(\w*)\n?([\s\S]+?)\n```/g, (match, lang, code) => {
        // Store the trimmed code
        const trimmedCode = code.trim();
        // Use Prism for highlighting if available for the language
        const highlightedCode = Prism.highlight(
            trimmedCode,
            Prism.languages[lang] || Prism.languages.plain,
            lang || 'plaintext'
        );
        return `<pre class="code-block"><code class="language-${lang || 'plaintext'}">${highlightedCode}</code></pre>`;
    });

    // Store code blocks to prevent them from being affected by markdown processing
    const codeBlockPattern = /<pre class="code-block">[\s\S]*?<\/pre>/g;
    const codeBlocks = [];
    formatted = formatted.replace(codeBlockPattern, (match) => {
        codeBlocks.push(match);
        return `<!-- code-block-${codeBlocks.length - 1} -->`;
    });

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

    return formatted;
}

/**
 * Generates a visualization by calling the backend API
 * 
 * @param {string} type - The type of visualization (chart, diagram, drawing)
 * @param {Object} data - The data for the visualization
 * @param {string} placeholderId - The ID of the placeholder element to update
 * @returns {Promise<void>}
 */
async function generateVisualization(type, data, placeholderId) {
    try {
        console.log(`Generating ${type} visualization with data:`, data);
        
        // Validate the data before sending to server
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid visualization data');
        }
        
        // Ensure data is properly formatted
        let sanitizedData = {};
        
        // Create appropriate defaults based on visualization type
        if (type === 'chart') {
            sanitizedData = {
                chart_type: data.chart_type || 'bar',
                title: data.title || 'Chart',
                labels: Array.isArray(data.labels) ? data.labels : ['A', 'B', 'C'],
                values: Array.isArray(data.values) ? data.values : [10, 20, 30]
            };
        } else if (type === 'diagram') {
            sanitizedData = {
                diagram_type: data.diagram_type || 'flowchart',
                elements: Array.isArray(data.elements) ? data.elements : [
                    {text: 'Start'}, {text: 'Process'}, {text: 'End'}
                ]
            };
        } else if (type === 'drawing') {
            sanitizedData = {
                description: data.description || 'A simple drawing'
            };
        }
        
        // Create request with sanitized data
        const requestBody = {
            visualization_type: type,
            data: sanitizedData
        };
        
        console.log("Sending visualization request:", JSON.stringify(requestBody).substring(0, 200));
        
        const response = await fetch('/generate_visualization', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server error (${response.status}):`, errorText);
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log("Visualization response received:", Object.keys(result));
        
        // Check for error in the response
        if (result.error) {
            throw new Error(result.error);
        }
        
        const placeholder = document.getElementById(placeholderId);
        
        if (!placeholder) {
            console.error('Placeholder element not found:', placeholderId);
            return;
        }
        
        // Clear the placeholder
        placeholder.innerHTML = '';
        placeholder.classList.remove('visualization-placeholder');
        placeholder.classList.add('visualization-container');
        
        // Add the visualization based on the type
        if (result.type === 'chart' || result.type === 'drawing') {
            if (!result.image) {
                throw new Error('Visualization response is missing image data');
            }
            const img = document.createElement('img');
            img.src = result.image;
            img.alt = `${type} visualization`;
            img.classList.add('visualization-image');
            placeholder.appendChild(img);
        } else if (result.type === 'diagram') {
            if (!result.svg) {
                throw new Error('Visualization response is missing SVG data');
            }
            
            // For SVG, sanitize the content before inserting
            let cleanSvg = result.svg;
            // Ensure SVG has proper XML declaration and namespaces
            if (!cleanSvg.includes('<svg')) {
                cleanSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
            }
            
            // Insert the SVG into the DOM
            placeholder.innerHTML = cleanSvg;
            
            // Add classes to the svg element for styling
            const svg = placeholder.querySelector('svg');
            if (svg) {
                svg.classList.add('visualization-svg');
                // Ensure SVG has width and height attributes
                if (!svg.hasAttribute('width')) svg.setAttribute('width', '800');
                if (!svg.hasAttribute('height')) svg.setAttribute('height', '600');
            }
        } else {
            throw new Error(`Unknown visualization type: ${result.type}`);
        }
    } catch (error) {
        console.error('Error generating visualization:', error);
        const placeholder = document.getElementById(placeholderId);
        if (placeholder) {
            // Create a fallback visualization
            const fallbackMessage = document.createElement('div');
            fallbackMessage.className = 'error-message';
            fallbackMessage.innerHTML = `
                <h3>Visualization Error</h3>
                <p>${error.message || 'Failed to generate visualization'}</p>
                <div>Try using a different visualization type or simpler data.</div>
            `;
            placeholder.innerHTML = '';
            placeholder.classList.remove('visualization-placeholder');
            placeholder.classList.add('visualization-container');
            placeholder.appendChild(fallbackMessage);
            
            // Add a retry button with simpler data
            const retryButton = document.createElement('button');
            retryButton.textContent = 'Retry with Simple Data';
            retryButton.className = 'retry-button';
            retryButton.style.marginTop = '10px';
            retryButton.style.padding = '8px 16px';
            retryButton.style.background = '#3498db';
            retryButton.style.color = 'white';
            retryButton.style.border = 'none';
            retryButton.style.borderRadius = '4px';
            retryButton.style.cursor = 'pointer';
            
            retryButton.onclick = () => {
                // Use very simple data for retry
                let simpleData;
                if (type === 'chart') {
                    simpleData = { 
                        chart_type: 'bar', 
                        title: 'Simple Chart', 
                        labels: ['A', 'B'], 
                        values: [10, 20] 
                    };
                } else if (type === 'diagram') {
                    simpleData = { 
                        diagram_type: 'flowchart', 
                        elements: [{ text: 'Start' }, { text: 'End' }] 
                    };
                } else {
                    simpleData = { description: 'A simple circle' };
                }
                
                generateVisualization(type, simpleData, placeholderId);
            };
            
            placeholder.appendChild(retryButton);
        }
    }
}

/**
 * Appends a new message to the chat interface
 * 
 * @param {string} content - The message content
 * @param {string} role - The role of the sender ('user', 'assistant', 'system', or 'error')
 * @param {boolean} [returnElement=false] - Whether to return the created DOM element
 * @returns {HTMLElement|undefined} The message element if returnElement is true
 */
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

/**
 * Shows or hides the loading indicator
 * 
 * @param {boolean} show - Whether to show the loading indicator
 * @returns {void}
 */
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('hidden', !show);
}

/**
 * Scrolls the chat interface to the bottom to show latest messages
 * 
 * @returns {void}
 */
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
    
    // Also clear chat history from localStorage
    try {
        localStorage.removeItem('chatHistory');
        console.log("🧹 Chat history cleared from localStorage");
    } catch (e) {
        console.warn("Could not clear chat history from localStorage:", e);
    }
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

/**
 * Debug utility: Displays the current chat context in a special message
 * Shows message history, system prompt, and role counts for debugging purposes
 * 
 * @returns {void}
 */
function showChatContext() {
    // Create a message showing the current context
    let contextInfo = "In the context window, I can see the following messages:\n\n";
    
    // Count roles for diagnostic info
    const roleCounts = {
        user: 0,
        assistant: 0,
        system: 0
    };
    
    // Log the current chat history for debugging
    console.log("🔍 CONTEXT DEBUG - Chat history contains:", chatHistory.length, "messages");
    console.log("🔍 CONTEXT DEBUG - Full details:", JSON.stringify(chatHistory.map(m => {
        roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
        return {
            role: m.role,
            contentPreview: typeof m.content === 'string' ? m.content.substring(0, 30) + '...' : '[complex content]'
        };
    })));

    // Add system prompt information at the beginning
    const systemPrompt = document.getElementById('systemPrompt').value.trim();
    if (systemPrompt) {
        contextInfo += `[SYSTEM PROMPT]: ${systemPrompt.substring(0, 100)}${systemPrompt.length > 100 ? '...' : ''}\n\n`;
        // Count the system prompt separately
        roleCounts.system = (roleCounts.system || 0) + 1;
    }

    // Show user/assistant exchanges
    chatHistory.forEach((msg, index) => {
        if (msg.role !== 'system') {
            // For better debugging, include the message index
            const preview = typeof msg.content === 'string' 
                ? msg.content.substring(0, 100) 
                : JSON.stringify(msg.content).substring(0, 100);
            contextInfo += `[${index}] ${msg.role}: ${preview}${preview.length > 99 ? '...' : ''}\n\n`;
        }
    });

    if (chatHistory.length <= 1 && !systemPrompt) {
        contextInfo += "No conversation history found. Try sending a few messages first.";
    }
    
    // Add role count summary with the system prompt included
    contextInfo += `\n--- Summary ---\n`;
    contextInfo += `Total messages: ${chatHistory.length + (systemPrompt ? 1 : 0)}\n`;
    contextInfo += `User messages: ${roleCounts.user || 0}\n`;
    contextInfo += `Assistant messages: ${roleCounts.assistant || 0}\n`;
    contextInfo += `System messages: ${systemPrompt ? 1 : 0}\n`;

    // Add this message to the chat
    appendMessage(contextInfo, 'system');
    
    // Also output to console
    console.table([
        ...(systemPrompt ? [{
            index: 'SYSTEM',
            role: 'system',
            preview: systemPrompt.substring(0, 30) + '...'
        }] : []),
        ...chatHistory.map((msg, i) => ({
            index: i,
            role: msg.role,
            preview: typeof msg.content === 'string' ? 
                msg.content.substring(0, 30) + '...' : 
                JSON.stringify(msg.content).substring(0, 30) + '...'
        }))
    ]);
}

// Export functions for global access
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

/**
 * Debug utility: Displays the complete chat history with full message content
 * Logs to console and displays in chat interface for detailed inspection
 * 
 * @returns {void}
 */
function displayFullChatHistory() {
    console.table(chatHistory.map((msg, index) => ({
        index,
        role: msg.role,
        contentType: typeof msg.content,
        preview: typeof msg.content === 'string' 
            ? (msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content)
            : JSON.stringify(msg.content).substring(0, 50) + '...'
    })));
    
    // Add this to the global window object for console access
    window.currentChatHistory = [...chatHistory];
    
    // Create a formatted message showing all content
    let historyText = "## COMPLETE CHAT HISTORY ##\n\n";
    
    chatHistory.forEach((msg, index) => {
        const content = typeof msg.content === 'string' 
            ? msg.content 
            : JSON.stringify(msg.content, null, 2);
            
        historyText += `[${index}] ${msg.role.toUpperCase()}:\n${content}\n\n---\n\n`;
    });
    
    // Add to chat as system message
    appendMessage(historyText, 'system');
}

// Add to window object for global access
window.displayFullChatHistory = displayFullChatHistory;