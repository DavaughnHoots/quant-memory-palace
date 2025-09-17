// API Client for Memory Palace Backend
class MemoryPalaceAPI {
    constructor(baseURL = 'http://localhost:8000') {
        this.baseURL = baseURL;
    }

    // Helper method for fetch requests
    async fetchAPI(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // Health check
    async checkHealth() {
        return this.fetchAPI('/health');
    }

    // Upload a document
    async uploadDocument(file, metadata = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        // Add metadata if provided
        if (metadata.title) formData.append('title', metadata.title);
        if (metadata.description) formData.append('description', metadata.description);
        if (metadata.tags) formData.append('tags', metadata.tags);

        return this.fetchAPI('/api/upload', {
            method: 'POST',
            body: formData
        });
    }

    // Get all documents with positions
    async getDocuments(limit = 100, fileType = null, tags = null) {
        let params = new URLSearchParams({ limit });
        if (fileType) params.append('file_type', fileType);
        if (tags) params.append('tags', tags);

        // Use simple endpoint for better performance with large datasets
        if (limit > 50) {
            return this.fetchAPI(`/api/documents/simple?limit=${limit}`);
        }
        return this.fetchAPI(`/api/documents?${params}`);
    }

    // Search documents
    async searchDocuments(query, limit = 10, threshold = 0.3, includeContent = true) {
        return this.fetchAPI('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query,
                limit,
                threshold,
                include_content: includeContent
            })
        });
    }

    // Get clusters
    async getClusters(method = 'hdbscan', nClusters = null) {
        let params = new URLSearchParams({ method });
        if (nClusters) params.append('n_clusters', nClusters);

        return this.fetchAPI(`/api/clusters?${params}`);
    }

    // Get spatial layout
    async getSpatialLayout(connectionThreshold = 0.8) {
        const params = new URLSearchParams({ connection_threshold: connectionThreshold });
        return this.fetchAPI(`/api/spatial?${params}`);
    }

    // Get statistics
    async getStatistics() {
        return this.fetchAPI('/api/stats');
    }

    // Delete a document
    async deleteDocument(documentId) {
        return this.fetchAPI(`/api/documents/${documentId}`, {
            method: 'DELETE'
        });
    }

    // Get document connections
    async getDocumentConnections(documentId, threshold = 0.7, maxConnections = 10) {
        const params = new URLSearchParams({ 
            threshold, 
            max_connections: maxConnections 
        });
        return this.fetchAPI(`/api/documents/${documentId}/connections?${params}`);
    }

    // Batch upload multiple files
    async batchUpload(files, onProgress = null) {
        const results = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: files.length,
                    file: file.name,
                    percentage: ((i + 1) / files.length) * 100
                });
            }

            try {
                const result = await this.uploadDocument(file);
                results.push({ success: true, file: file.name, result });
            } catch (error) {
                results.push({ success: false, file: file.name, error: error.message });
            }
        }

        return results;
    }

    // Get documents by cluster
    async getDocumentsByCluster(clusterId) {
        const documents = await this.getDocuments();
        return documents.filter(doc => doc.cluster === clusterId);
    }

    // Search with filters
    async advancedSearch(query, filters = {}) {
        const searchQuery = {
            query,
            limit: filters.limit || 20,
            threshold: filters.threshold || 0.7,
            filter_tags: filters.tags || null,
            filter_type: filters.fileType || null,
            include_content: filters.includeContent !== false
        };

        return this.fetchAPI('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchQuery)
        });
    }

    // Get similar documents
    async getSimilarDocuments(documentId, limit = 5) {
        return this.getDocumentConnections(documentId, 0.7, limit);
    }

    // Export collection data
    async exportCollection() {
        const [documents, clusters, spatial, stats] = await Promise.all([
            this.getDocuments(1000),
            this.getClusters(),
            this.getSpatialLayout(),
            this.getStatistics()
        ]);

        return {
            documents,
            clusters,
            spatial,
            stats,
            exported_at: new Date().toISOString()
        };
    }

    // Monitor upload progress
    createUploadMonitor() {
        let uploads = [];
        
        return {
            add: (file) => {
                const upload = {
                    id: Date.now() + Math.random(),
                    file: file.name,
                    size: file.size,
                    progress: 0,
                    status: 'pending'
                };
                uploads.push(upload);
                return upload.id;
            },
            
            update: (id, progress, status = 'uploading') => {
                const upload = uploads.find(u => u.id === id);
                if (upload) {
                    upload.progress = progress;
                    upload.status = status;
                }
            },
            
            complete: (id, success = true) => {
                const upload = uploads.find(u => u.id === id);
                if (upload) {
                    upload.progress = 100;
                    upload.status = success ? 'completed' : 'failed';
                }
            },
            
            getAll: () => uploads,
            
            clear: () => {
                uploads = [];
            }
        };
    }

    // WebSocket connection for real-time updates (future enhancement)
    connectWebSocket(onMessage) {
        const ws = new WebSocket(`ws://localhost:8000/ws`);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            onMessage(data);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(onMessage), 5000);
        };
        
        return ws;
    }
}

// Create global API instance
const API = new MemoryPalaceAPI();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryPalaceAPI;
}