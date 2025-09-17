// Deep Dive Mode for Memory Palace 3D

class DeepDiveMode {
    constructor(scene, api) {
        this.scene = scene;
        this.api = api;
        this.isActive = false;
        this.selectedDocument = null;
        this.insights = {};
        this.visualizations = {};
        this.originalOpacities = new Map();
        this.hiddenMeshes = new Map(); // Store completely hidden meshes
        this.performanceMode = false; // Flag for performance optimizations
        this.particlesEnabled = false; // Particles off by default for better performance
        this.mediaPreviews = new Map(); // Cache for media previews
    }

    toggleParticles() {
        this.particlesEnabled = !this.particlesEnabled;
        console.log('Particle effects', this.particlesEnabled ? 'enabled' : 'disabled');
        return this.particlesEnabled;
    }
    
    async activate(documentId) {
        if (this.isActive) {
            await this.deactivate();
        }
        
        // Check if document is part of a cluster
        const docMesh = this.scene.documentMeshes.get(documentId);
        if (!docMesh) {
            console.warn('Document not found in scene');
            return;
        }
        
        // Debug logging
        console.log('Deep Dive Debug - Document mesh userData:', docMesh.userData);
        console.log('Deep Dive Debug - Document object:', docMesh.userData.document);
        console.log('Deep Dive Debug - Cluster value:', docMesh.userData.document?.cluster);
        console.log('Deep Dive Debug - Current cluster view:', this.scene.currentClusterView);
        
        const isInCluster = docMesh.userData.document && 
                          docMesh.userData.document.cluster !== undefined && 
                          docMesh.userData.document.cluster !== -1;
        
        this.isActive = true;
        this.selectedDocument = documentId;
        
        console.log('Deep Dive - Activating for document:', documentId);
        console.log('Deep Dive - Is in cluster?', isInCluster);
        console.log('Deep Dive - Cluster ID:', docMesh.userData.document?.cluster);
        
        // 1. Transition to Deep Dive View
        await this.transitionToDeepDive();
        
        // 2. Load comprehensive analysis
        try {
            const analysis = await this.analyzeDocument(documentId);
            this.insights[documentId] = analysis;
            
            // Check document count for performance mode
            const totalDocuments = this.scene.documentMeshes.size;
            const relatedCount = analysis.related_documents ? analysis.related_documents.length : 0;
            this.performanceMode = totalDocuments > 30 || relatedCount > 30;
            
            if (this.performanceMode) {
                console.log('Performance mode activated: Total documents: ' + totalDocuments + ', Related: ' + relatedCount);
            }
            
            // 3. Create visualizations (only if in cluster)
            if (isInCluster && !this.performanceMode) {
                this.createDeepDiveVisualizations(analysis);
            } else if (isInCluster && this.performanceMode) {
                // Simplified visualizations for performance
                this.createSimplifiedVisualizations(analysis);
            } else {
                // Minimal visualization for non-clustered documents
                this.createMinimalVisualization(analysis);
            }
            
            // 4. Show insights panel
            this.showInsightsPanel(analysis);
        } catch (error) {
            console.error('Deep Dive analysis failed:', error);
            this.deactivate();
        }
    }

    async transitionToDeepDive() {
        // Get the selected document's cluster
        const selectedMesh = this.scene.documentMeshes.get(this.selectedDocument);
        const selectedCluster = selectedMesh?.userData?.document?.cluster;
        
        // If we're in cluster view, check which cluster we're viewing
        const inClusterView = this.scene.currentClusterView !== null && this.scene.currentClusterView !== undefined;
        
        // Completely hide unrelated documents for better performance
        this.scene.documentMeshes.forEach((mesh, id) => {
            if (id !== this.selectedDocument) {
                // Store original visibility state
                this.hiddenMeshes.set(id, {
                    visible: mesh.visible,
                    opacity: mesh.material.opacity
                });
                
                // If in cluster view, keep documents from the same cluster visible but dimmed
                if (inClusterView && mesh.userData.document && 
                    mesh.userData.document.cluster === this.scene.currentClusterView) {
                    // Keep cluster documents visible but dim them
                    mesh.material.opacity = 0.3;
                    mesh.material.transparent = true;
                } else {
                    // Completely hide non-cluster documents
                    mesh.visible = false;
                    
                    // Also hide labels if they exist
                    if (mesh.userData.label) {
                        mesh.userData.label.visible = false;
                    }
                }
            } else {
                // Highlight selected document
                mesh.material.emissive = new THREE.Color(0x667eea);
                mesh.material.emissiveIntensity = 0.5;
            }
        });
        
        // Hide all connection lines for performance
        if (this.scene.connectionLines) {
            this.scene.connectionLines.forEach(line => {
                if (line) line.visible = false;
            });
        }
        
        // Hide cluster labels
        if (this.scene.clusterLabels) {
            this.scene.clusterLabels.forEach(label => {
                if (label) label.visible = false;
            });
        }

        // Focus camera on selected document
        const targetMesh = this.scene.documentMeshes.get(this.selectedDocument);
        if (targetMesh) {
            await this.smoothCameraTransition(targetMesh.position);
            
            // Only create analysis sphere if not in performance mode
            if (!this.performanceMode) {
                this.createAnalysisSphere(targetMesh.position);
            }
        }
    }

    async analyzeDocument(documentId) {
        // Fetch deep analysis from backend
        try {
            const response = await fetch(`${this.api.baseURL}/api/documents/${documentId}/deepdive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Analysis failed');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to analyze document:', error);
            // Return mock data for demo
            return this.getMockAnalysis(documentId);
        }
    }

    getMockAnalysis(documentId) {
        // Mock analysis data for demo purposes
        const doc = Array.from(this.scene.documentMeshes.entries())
            .find(([id]) => id === documentId);
        
        return {
            document_id: documentId,
            title: doc ? doc[1].userData.title : 'Document',
            information_density: 0.75,
            uniqueness: 0.82,
            avg_connection_strength: 0.68,
            insights: [
                'This document is highly connected with 42 other documents',
                'Strong topical cluster identified around machine learning',
                'Cross-media connections detected across PDFs and images',
                'Part of a temporal sequence spanning 3 months'
            ],
            entities: [
                { name: 'Neural Networks', type: 'concept' },
                { name: 'Deep Learning', type: 'concept' },
                { name: 'OpenAI', type: 'organization' },
                { name: 'Transformer', type: 'technology' }
            ],
            key_concepts: [
                { text: 'machine', importance: 1.0, count: 45 },
                { text: 'learning', importance: 0.95, count: 42 },
                { text: 'neural', importance: 0.85, count: 38 },
                { text: 'network', importance: 0.80, count: 35 },
                { text: 'deep', importance: 0.75, count: 30 }
            ],
            related_documents: this.getRelatedDocuments(documentId, 20),
            top_connections: this.getRelatedDocuments(documentId, 5),
            recommendation: 'This document is a knowledge hub. Consider using it as a starting point for exploration of machine learning concepts.'
        };
    }

    getRelatedDocuments(documentId, limit) {
        // Get nearby documents as related
        const related = [];
        const sourceMesh = this.scene.documentMeshes.get(documentId);
        
        if (sourceMesh) {
            const distances = [];
            
            this.scene.documentMeshes.forEach((mesh, id) => {
                if (id !== documentId) {
                    const distance = sourceMesh.position.distanceTo(mesh.position);
                    distances.push({
                        id: id,
                        title: mesh.userData.title || 'Untitled',
                        similarity: Math.max(0, 1 - distance / 30),
                        type: mesh.userData.type || 'unknown',
                        preview: mesh.userData.preview || ''
                    });
                }
            });
            
            // Sort by similarity and return top N
            distances.sort((a, b) => b.similarity - a.similarity);
            return distances.slice(0, limit);
        }
        
        return [];
    }

    createDeepDiveVisualizations(analysis) {
        const centerDoc = this.scene.documentMeshes.get(this.selectedDocument);
        if (!centerDoc) return;
        
        // 1. Knowledge Web - Show related documents in orbital rings
        this.createKnowledgeWeb(centerDoc, analysis.related_documents || []);
        
        // 2. Concept Clouds - Floating keywords around document (limit in performance mode)
        if (analysis.key_concepts) {
            const conceptLimit = this.performanceMode ? 5 : 8;
            this.createConceptClouds(centerDoc, analysis.key_concepts.slice(0, conceptLimit));
        }
        
        // 3. Information Density Particles - SKIP in performance mode or if disabled
        if (!this.performanceMode && this.particlesEnabled) {
            this.createDensityParticles(centerDoc, analysis.information_density || 0.5);
        }
        
        // 4. Media Previews - Add for images/videos
        this.createMediaPreviews(centerDoc, analysis.related_documents || []);
    }
    
    createSimplifiedVisualizations(analysis) {
        const centerDoc = this.scene.documentMeshes.get(this.selectedDocument);
        if (!centerDoc) return;
        
        // Only show top 10 related documents in simple rings
        const limitedDocs = (analysis.related_documents || []).slice(0, 10);
        this.createKnowledgeWeb(centerDoc, limitedDocs);
        
        // Show only top 3 concepts
        if (analysis.key_concepts) {
            this.createConceptClouds(centerDoc, analysis.key_concepts.slice(0, 3));
        }
        
        // No particles or complex effects
    }
    
    createMinimalVisualization(analysis) {
        const centerDoc = this.scene.documentMeshes.get(this.selectedDocument);
        if (!centerDoc) return;
        
        // Just highlight the document with a simple glow
        const glowGeometry = new THREE.SphereGeometry(1.5, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x667eea,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.position.copy(centerDoc.position);
        
        this.scene.scene.add(glowMesh);
        this.visualizations.glow = glowMesh;
        
        // Show message that document is not clustered
        console.log('Document is not part of a cluster - showing minimal visualization');
    }

    createKnowledgeWeb(centerDoc, relatedDocs) {
        // Create orbital rings at different similarity levels
        const rings = [
            { radius: 3, similarity: 0.9, color: 0xff0000, documents: [] },
            { radius: 5, similarity: 0.8, color: 0xff9900, documents: [] },
            { radius: 7, similarity: 0.7, color: 0xffff00, documents: [] },
            { radius: 9, similarity: 0.6, color: 0x00ff00, documents: [] }
        ];

        // Sort documents into rings by similarity
        relatedDocs.forEach(doc => {
            const ring = rings.find(r => doc.similarity >= r.similarity);
            if (ring) ring.documents.push(doc);
        });

        // Create visual rings with documents
        rings.forEach((ring, ringIndex) => {
            if (ring.documents.length === 0) return;
            
            // Create ring geometry
            const ringGeometry = new THREE.TorusGeometry(ring.radius, 0.05, 16, 100);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: ring.color,
                opacity: 0.3,
                transparent: true
            });
            const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.position.copy(centerDoc.position);
            this.scene.scene.add(ringMesh);
            
            if (!this.visualizations.rings) this.visualizations.rings = [];
            this.visualizations.rings.push(ringMesh);
            
            // Position documents on ring
            ring.documents.forEach((doc, i) => {
                const angle = (Math.PI * 2 * i) / ring.documents.length;
                const x = centerDoc.position.x + Math.cos(angle) * ring.radius;
                const z = centerDoc.position.z + Math.sin(angle) * ring.radius;
                
                // Animate document to ring position if it exists in scene
                const docMesh = this.scene.documentMeshes.get(doc.id);
                if (docMesh) {
                    this.animateToPosition(docMesh, { 
                        x, 
                        y: centerDoc.position.y, 
                        z 
                    });
                    
                    // Make it slightly visible
                    docMesh.material.opacity = 0.3;
                    
                    // Create connection beam
                    this.createConnectionBeam(
                        centerDoc.position, 
                        { x, y: centerDoc.position.y, z }, 
                        ring.color
                    );
                }
            });
        });
    }

    createConceptClouds(centerDoc, concepts) {
        // Create floating text sprites for key concepts
        concepts.slice(0, 8).forEach((concept, i) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 64;
            
            // Gradient background
            const gradient = context.createLinearGradient(0, 0, 256, 0);
            gradient.addColorStop(0, 'rgba(102, 126, 234, 0.8)');
            gradient.addColorStop(1, 'rgba(118, 75, 162, 0.8)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 256, 64);
            
            // Text
            context.fillStyle = 'white';
            context.font = `${20 + concept.importance * 10}px Arial`;
            context.textAlign = 'center';
            context.fillText(concept.text, 128, 40);
            
            // Create sprite
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.8
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            
            // Position in cloud formation
            const theta = (Math.PI * 2 * i) / concepts.length;
            const phi = Math.PI / 4 + Math.random() * Math.PI / 4;
            const radius = 2 + Math.random() * 2;
            
            sprite.position.set(
                centerDoc.position.x + radius * Math.sin(phi) * Math.cos(theta),
                centerDoc.position.y + radius * Math.cos(phi),
                centerDoc.position.z + radius * Math.sin(phi) * Math.sin(theta)
            );
            
            sprite.scale.set(2, 0.5, 1);
            
            // Floating animation
            this.animateFloating(sprite, i);
            
            this.scene.scene.add(sprite);
            
            if (!this.visualizations.concepts) this.visualizations.concepts = [];
            this.visualizations.concepts.push(sprite);
        });
    }

    createDensityParticles(centerDoc, density) {
        // Create particle system showing information density
        const particleCount = Math.floor(density * 500);
        const particles = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i < particleCount; i++) {
            // Spherical distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 1 + Math.random() * 3;
            
            positions.push(
                centerDoc.position.x + radius * Math.sin(phi) * Math.cos(theta),
                centerDoc.position.y + radius * Math.cos(phi),
                centerDoc.position.z + radius * Math.sin(phi) * Math.sin(theta)
            );
            
            // Color based on density
            const color = new THREE.Color().setHSL(0.8 - density * 0.3, 1, 0.5);
            colors.push(color.r, color.g, color.b);
        }
        
        particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        const particleSystem = new THREE.Points(particles, particleMaterial);
        this.scene.scene.add(particleSystem);
        this.visualizations.densityParticles = particleSystem;
        
        // Animate particles
        this.animateParticles(particleSystem);
    }

    createAnalysisSphere(position) {
        // Create pulsing analysis sphere
        const sphereGeometry = new THREE.SphereGeometry(10, 32, 32);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0x667eea,
            transparent: true,
            opacity: 0.1,
            wireframe: true
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(position);
        
        this.scene.scene.add(sphere);
        this.visualizations.analysisSphere = sphere;
        
        // Pulse animation
        this.animatePulse(sphere);
    }

    createConnectionBeam(start, end, color) {
        const points = [
            new THREE.Vector3(start.x, start.y, start.z),
            new THREE.Vector3(end.x, end.y, end.z)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 3,
            transparent: true,
            opacity: 0.6
        });
        
        const beam = new THREE.Line(geometry, material);
        this.scene.scene.add(beam);
        
        if (!this.visualizations.beams) this.visualizations.beams = [];
        this.visualizations.beams.push(beam);
    }
    
    createMediaPreviews(centerDoc, relatedDocs) {
        // Only create previews for closest documents (90% similarity or top 5)
        const previewCandidates = relatedDocs
            .filter(doc => doc.similarity > 0.9 || relatedDocs.indexOf(doc) < 5)
            .slice(0, 5); // Limit to 5 previews max
        
        previewCandidates.forEach((doc, index) => {
            const docMesh = this.scene.documentMeshes.get(doc.id);
            if (!docMesh) return;
            
            const fileType = doc.type || docMesh.userData.type;
            
            if (fileType === 'image') {
                this.createImagePreview(docMesh, doc);
            } else if (fileType === 'audio' || fileType === 'video') {
                this.createMediaIndicator(docMesh, doc, fileType);
            } else if (fileType === 'pdf') {
                this.createPDFIndicator(docMesh, doc);
            }
        });
    }
    
    createImagePreview(docMesh, docData) {
        // Create a plane to show image preview
        const planeGeometry = new THREE.PlaneGeometry(2, 2);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        
        // Create placeholder with image icon
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;
        
        // Background
        context.fillStyle = '#2a2a2a';
        context.fillRect(0, 0, 256, 256);
        
        // Image icon
        context.fillStyle = '#667eea';
        context.font = '80px Arial';
        context.textAlign = 'center';
        context.fillText('🖼️', 128, 140);
        
        // Title
        context.fillStyle = 'white';
        context.font = '14px Arial';
        const title = docData.title || 'Image';
        const maxLength = 20;
        const displayTitle = title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
        context.fillText(displayTitle, 128, 200);
        
        const texture = new THREE.CanvasTexture(canvas);
        planeMaterial.map = texture;
        
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.position.copy(docMesh.position);
        plane.position.y += 2; // Position above the document
        
        // Make it face the camera
        plane.lookAt(this.scene.camera.position);
        
        this.scene.scene.add(plane);
        
        if (!this.visualizations.previews) this.visualizations.previews = [];
        this.visualizations.previews.push(plane);
        
        // Store in cache
        this.mediaPreviews.set(docData.id, plane);
    }
    
    createMediaIndicator(docMesh, docData, mediaType) {
        // Create sprite with play button for audio/video
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;
        
        // Circle background
        context.beginPath();
        context.arc(64, 64, 60, 0, Math.PI * 2);
        context.fillStyle = mediaType === 'audio' ? '#ff9900' : '#ff0066';
        context.fill();
        
        // Play triangle
        context.fillStyle = 'white';
        context.beginPath();
        context.moveTo(50, 40);
        context.lineTo(50, 88);
        context.lineTo(85, 64);
        context.closePath();
        context.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(docMesh.position);
        sprite.position.y += 1.5;
        sprite.scale.set(1, 1, 1);
        
        this.scene.scene.add(sprite);
        
        if (!this.visualizations.previews) this.visualizations.previews = [];
        this.visualizations.previews.push(sprite);
        
        this.mediaPreviews.set(docData.id, sprite);
    }
    
    createPDFIndicator(docMesh, docData) {
        // Create PDF icon indicator
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;
        
        // Rectangle background
        context.fillStyle = '#dc2626';
        context.fillRect(20, 10, 88, 108);
        
        // PDF text
        context.fillStyle = 'white';
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.fillText('PDF', 64, 70);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(docMesh.position);
        sprite.position.y += 1.5;
        sprite.scale.set(0.8, 0.8, 1);
        
        this.scene.scene.add(sprite);
        
        if (!this.visualizations.previews) this.visualizations.previews = [];
        this.visualizations.previews.push(sprite);
        
        this.mediaPreviews.set(docData.id, sprite);
    }

    showInsightsPanel(analysis) {
        // Create or update insights panel
        let panel = document.getElementById('deep-dive-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'deep-dive-panel';
            panel.className = 'deep-dive-panel';
            document.body.appendChild(panel);
        }
        
        // Check if document is in cluster
        const docMesh = this.scene.documentMeshes.get(this.selectedDocument);
        
        // Debug logging for panel
        console.log('Panel Debug - Checking cluster for panel display');
        console.log('Panel Debug - docMesh exists?', !!docMesh);
        console.log('Panel Debug - userData:', docMesh?.userData);
        console.log('Panel Debug - document object:', docMesh?.userData?.document);
        console.log('Panel Debug - cluster value:', docMesh?.userData?.document?.cluster);
        
        const isInCluster = docMesh && 
                          docMesh.userData.document && 
                          docMesh.userData.document.cluster !== undefined && 
                          docMesh.userData.document.cluster !== -1;
        
        // Performance mode indicator
        const performanceIndicator = this.performanceMode ? 
            '<span style="color: #ff9900; font-size: 12px;">⚡ Performance Mode Active</span>' : '';
        
        // Cluster status
        const clusterStatus = isInCluster ? 
            `<span style="color: #00ff00;">Cluster ${docMesh.userData.document.cluster}</span>` :
            '<span style="color: #ff9900;">Not Clustered</span>';
        
        panel.innerHTML = `
            <div class="deep-dive-header">
                <h2>Deep Dive Analysis</h2>
                <button onclick="window.deepDiveMode.deactivate()">×</button>
            </div>
            
            <div class="deep-dive-content">
                <div class="insight-section">
                    <h3>📊 Document Intelligence</h3>
                    <p><strong>Status:</strong> ${clusterStatus} ${performanceIndicator}</p>
                    <p><strong>Information Density:</strong> ${(analysis.information_density * 100).toFixed(1)}%</p>
                    <p><strong>Uniqueness Score:</strong> ${(analysis.uniqueness * 100).toFixed(1)}%</p>
                    <p><strong>Connection Strength:</strong> ${analysis.avg_connection_strength.toFixed(3)}</p>
                    ${this.performanceMode ? '<p style="color: #ff9900;">⚠️ Particles disabled for performance</p>' : ''}
                </div>
                
                <div class="insight-section">
                    <h3>🔍 Key Insights</h3>
                    <ul>
                        ${analysis.insights.map(insight => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="insight-section">
                    <h3>🏷️ Extracted Entities</h3>
                    <div class="entity-tags">
                        ${analysis.entities.map(entity => 
                            `<span class="entity-tag ${entity.type}">${entity.name}</span>`
                        ).join('')}
                    </div>
                </div>
                
                <div class="insight-section">
                    <h3>🔗 Strongest Connections</h3>
                    <div class="connection-list with-previews">
                        ${analysis.top_connections.map(conn => {
                            // Check file type from API response
                            const fileType = conn.file_type || 'unknown';
                            const isImage = fileType === 'image' || conn.title.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);
                            const isPDF = fileType === 'pdf' || conn.title.match(/\.pdf$/i);

                            // Use file_url from API if available, construct full URL
                            const previewUrl = conn.file_url ? `http://localhost:8000${conn.file_url}` : null;

                            return `
                            <div class="connection-item with-preview" onclick="window.deepDiveMode.navigateToDocument('${conn.id}')">
                                ${isImage && previewUrl ? `
                                    <div class="connection-preview">
                                        <img src="${previewUrl}"
                                             alt="${conn.title}"
                                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                                             style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">
                                        <div class="preview-placeholder" style="display: none; width: 60px; height: 60px; background: #333; border-radius: 4px; align-items: center; justify-content: center; font-size: 24px;">
                                            🖼️
                                        </div>
                                    </div>
                                ` : isImage ? `
                                    <div class="connection-preview">
                                        <div class="preview-placeholder" style="width: 60px; height: 60px; background: #333; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                            🖼️
                                        </div>
                                    </div>
                                ` : isPDF ? `
                                    <div class="connection-preview">
                                        <div class="preview-placeholder" style="width: 60px; height: 60px; background: #dc3545; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white;">
                                            📄
                                        </div>
                                    </div>
                                ` : `
                                    <div class="connection-preview">
                                        <div class="preview-placeholder" style="width: 60px; height: 60px; background: #444; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                            📁
                                        </div>
                                    </div>
                                `}
                                <div class="connection-info">
                                    <span class="connection-title">${conn.title}</span>
                                    <div class="connection-meta">
                                        <span class="connection-score">${(conn.similarity * 100).toFixed(0)}%</span>
                                        ${conn.preview ? `<span class="connection-preview-text">${conn.preview.substring(0, 50)}...</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                </div>
                
                <div class="insight-section">
                    <h3>💡 AI Recommendations</h3>
                    <p>${analysis.recommendation}</p>
                </div>
                
                <div class="deep-dive-actions">
                    <button onclick="window.deepDiveMode.exportAnalysis()">Export Analysis</button>
                    <button onclick="window.deepDiveMode.findSimilar()">Find Similar</button>
                </div>
            </div>
        `;
        
        panel.style.display = 'block';
    }

    async deactivate() {
        if (!this.isActive) return;
        
        // Clean up visualizations
        Object.values(this.visualizations).forEach(obj => {
            if (Array.isArray(obj)) {
                obj.forEach(item => {
                    this.scene.scene.remove(item);
                    if (item.geometry) item.geometry.dispose();
                    if (item.material) {
                        if (item.material.map) item.material.map.dispose();
                        item.material.dispose();
                    }
                });
            } else if (obj) {
                this.scene.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
        });
        
        // Clean up media previews
        this.mediaPreviews.forEach(preview => {
            this.scene.scene.remove(preview);
            if (preview.geometry) preview.geometry.dispose();
            if (preview.material) {
                if (preview.material.map) preview.material.map.dispose();
                preview.material.dispose();
            }
        });
        this.mediaPreviews.clear();
        
        // Restore hidden documents
        this.hiddenMeshes.forEach((state, id) => {
            const mesh = this.scene.documentMeshes.get(id);
            if (mesh) {
                mesh.visible = state.visible;
                mesh.material.opacity = state.opacity;
                mesh.material.transparent = state.opacity < 1;
                
                // Restore label visibility
                if (mesh.userData.label) {
                    mesh.userData.label.visible = state.visible;
                }
            }
        });
        
        // Reset selected document highlighting
        const selectedMesh = this.scene.documentMeshes.get(this.selectedDocument);
        if (selectedMesh && selectedMesh.material.emissive) {
            selectedMesh.material.emissive = new THREE.Color(0x000000);
            selectedMesh.material.emissiveIntensity = 0;
        }
        
        // Restore connection lines visibility
        if (this.scene.connectionLines && this.scene.connectionsVisible) {
            this.scene.connectionLines.forEach(line => {
                if (line) line.visible = true;
            });
        }
        
        // Restore cluster labels
        if (this.scene.clusterLabels) {
            this.scene.clusterLabels.forEach(label => {
                if (label) label.visible = true;
            });
        }
        
        // Hide panel
        const panel = document.getElementById('deep-dive-panel');
        if (panel) panel.style.display = 'none';
        
        // Reset state
        this.isActive = false;
        this.selectedDocument = null;
        this.visualizations = {};
        this.hiddenMeshes.clear();
        this.originalOpacities.clear();
        this.performanceMode = false;
        
        // Refresh the scene if needed
        if (this.scene.render) {
            this.scene.render();
        }
    }

    // Animation helpers
    animateToPosition(mesh, targetPos) {
        const startPos = mesh.position.clone();
        const duration = 1000;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = this.easeInOutCubic(progress);
            
            mesh.position.x = startPos.x + (targetPos.x - startPos.x) * eased;
            mesh.position.y = startPos.y + (targetPos.y - startPos.y) * eased;
            mesh.position.z = startPos.z + (targetPos.z - startPos.z) * eased;
            
            if (progress < 1 && this.isActive) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    animateFloating(object, offset) {
        const baseY = object.position.y;
        const animate = () => {
            const time = Date.now() * 0.001;
            object.position.y = baseY + Math.sin(time + offset) * 0.2;
            object.rotation.z = Math.sin(time + offset) * 0.1;
            
            if (this.isActive) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    animatePulse(object) {
        const animate = () => {
            const time = Date.now() * 0.001;
            const scale = 1 + Math.sin(time) * 0.1;
            object.scale.set(scale, scale, scale);
            object.material.opacity = 0.1 + Math.sin(time) * 0.05;
            
            if (this.isActive) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    animateParticles(particleSystem) {
        const positions = particleSystem.geometry.attributes.position.array;
        const basePositions = [...positions];
        
        const animate = () => {
            const time = Date.now() * 0.001;
            
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] = basePositions[i] + Math.sin(time + i) * 0.1;
                positions[i + 1] = basePositions[i + 1] + Math.cos(time + i) * 0.1;
                positions[i + 2] = basePositions[i + 2] + Math.sin(time + i + 1) * 0.1;
            }
            
            particleSystem.geometry.attributes.position.needsUpdate = true;
            
            if (this.isActive) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    smoothCameraTransition(targetPosition) {
        return new Promise(resolve => {
            const startPos = this.scene.camera.position.clone();
            const endPos = targetPosition.clone();
            endPos.y += 5;
            endPos.z += 10;
            
            const duration = 2000;
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = this.easeInOutCubic(progress);
                
                this.scene.camera.position.lerpVectors(startPos, endPos, eased);
                this.scene.camera.lookAt(targetPosition);
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            
            animate();
        });
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Export and utility functions
    async exportAnalysis() {
        const analysis = this.insights[this.selectedDocument];
        if (!analysis) return;
        
        const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deep-dive-${this.selectedDocument}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async findSimilar() {
        if (!this.selectedDocument) return;
        
        // Use the search functionality to find similar documents
        const doc = this.scene.documentMeshes.get(this.selectedDocument);
        if (doc && doc.userData.title) {
            // Extract key terms from title
            const terms = doc.userData.title.split(/[\s\-_\.]+/).slice(0, 3).join(' ');
            
            // Trigger search
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = terms;
                searchInput.dispatchEvent(new Event('input'));
            }
        }
    }

    navigateToDocument(docId) {
        // Store current cluster view state
        const currentClusterView = this.scene.currentClusterView;
        
        // Deactivate current deep dive
        this.deactivate();
        
        // If we were in cluster view, ensure the new document is visible
        if (currentClusterView !== null && currentClusterView !== undefined) {
            const targetMesh = this.scene.documentMeshes.get(docId);
            if (targetMesh && targetMesh.userData.document) {
                // Check if target document is in the same cluster
                if (targetMesh.userData.document.cluster !== currentClusterView) {
                    // Document is in a different cluster, switch to that cluster
                    this.scene.jumpToCluster(targetMesh.userData.document.cluster);
                }
            }
        }
        
        // Activate deep dive for the new document
        setTimeout(() => {
            this.activate(docId);
        }, 500);
    }
}