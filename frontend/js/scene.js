// 3D Scene Manager for Memory Palace
class MemoryPalaceScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.documents = [];
        this.documentMeshes = new Map();
        this.connections = [];
        this.connectionLines = [];
        this.highlightedDocuments = new Set();
        this.raycaster = new THREE.Raycaster();
        
        // Cluster view mode
        this.clusterViewMode = true; // Start with cluster centers only
        this.visibleClusters = new Set(); // Track which clusters are expanded
        this.clusterMeshes = new Map(); // Store cluster center meshes
        this.documentsByCluster = new Map(); // Group documents by cluster
        
        // Connection visibility controls
        this.connectionsVisible = true;
        this.connectionThreshold = 0.6;
        this.maxConnections = 10; // Reduced default for better performance
        this.mouse = new THREE.Vector2();
        this.selectedDocument = null;
        this.currentTheme = 'dark'; // Default theme
        
        // Visual modes
        this.galaxyMode = false;
        this.xrayMode = false;
        this.heatMapMode = false;
        this.animationsPaused = false;
        
        // Galaxy mode data
        this.clusterCenters = [];
        this.documentOrbits = new Map();
        
        // Theme configurations
        this.themes = {
            dark: {
                background: 0x0a0a0f,
                fog: 0x0a0a0f,
                grid: { main: 0x444444, sub: 0x222222 },
                ambient: 0x404040,
                particles: 0x667eea,
                text: 'rgba(255, 255, 255, 0.9)',
                textOutline: 'rgba(0, 0, 0, 0.5)'
            },
            light: {
                background: 0xf0f0f0,
                fog: 0xe0e0e0,
                grid: { main: 0x999999, sub: 0xcccccc },
                ambient: 0xf0f0f0,
                particles: 0x4a5568,
                text: 'rgba(0, 0, 0, 0.9)',
                textOutline: 'rgba(255, 255, 255, 0.8)'
            }
        };
        
        // File type colors for both themes
        this.fileTypeColors = {
            dark: {
                pdf: 0x4A90E2,    // Bright blue
                image: 0x52C41A,  // Bright green
                text: 0xFA8C16,   // Bright orange
                audio: 0xB37FEB,  // Bright purple
                video: 0xFF69B4,  // Bright pink
                unknown: 0x888888 // Gray
            },
            light: {
                pdf: 0x2E5C8A,    // Dark blue
                image: 0x389E0D,  // Dark green
                text: 0xD46B08,   // Dark orange
                audio: 0x722ED1,  // Dark purple
                video: 0xC41A7F,  // Dark pink
                unknown: 0x595959 // Dark gray
            }
        };
        
        this.init();
        this.animate();
    }

    init() {
        // Scene setup with theme
        this.scene = new THREE.Scene();
        const theme = this.themes[this.currentTheme];
        this.scene.background = new THREE.Color(theme.background);
        this.scene.fog = new THREE.Fog(theme.fog, 10, 100);

        // Camera setup
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI / 1.5;

        // Lighting
        this.setupLighting();

        // Grid and axes helpers
        this.addHelpers();

        // Event listeners
        this.setupEventListeners();

        // Particle system for background
        this.createParticleSystem();
    }

    setupLighting() {
        // Ambient light based on theme
        const theme = this.themes[this.currentTheme];
        this.ambientLight = new THREE.AmbientLight(theme.ambient, this.currentTheme === 'dark' ? 1.5 : 2);
        this.scene.add(this.ambientLight);

        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Point lights for visual interest
        const pointLight1 = new THREE.PointLight(0x667eea, 0.5, 30);
        pointLight1.position.set(10, 10, 10);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x764ba2, 0.5, 30);
        pointLight2.position.set(-10, -10, -10);
        this.scene.add(pointLight2);

        // Hemisphere light for soft lighting
        const hemisphereLight = new THREE.HemisphereLight(0x667eea, 0x764ba2, 0.3);
        this.scene.add(hemisphereLight);
    }

    addHelpers() {
        // Grid with theme colors
        const theme = this.themes[this.currentTheme];
        this.gridHelper = new THREE.GridHelper(40, 40, theme.grid.main, theme.grid.sub);
        this.gridHelper.position.y = -10;
        this.scene.add(this.gridHelper);

        // Axes (optional, can be commented out)
        // const axesHelper = new THREE.AxesHelper(5);
        // this.scene.add(axesHelper);
    }

    createParticleSystem() {
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 500;
        const posArray = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 100;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

        const theme = this.themes[this.currentTheme];
        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.05,
            color: theme.particles,
            transparent: true,
            opacity: this.currentTheme === 'dark' ? 0.3 : 0.2,
            blending: THREE.AdditiveBlending
        });

        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(particlesMesh);
        this.particles = particlesMesh;
    }

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // Mouse events
        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e), false);
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for cluster hover in cluster view mode
        if (this.clusterViewMode && this.clusterMeshes.size > 0) {
            // Only check VISIBLE cluster meshes
            const clusterMeshArray = Array.from(this.clusterMeshes.values()).filter(mesh => mesh.visible);
            const clusterIntersects = this.raycaster.intersectObjects(clusterMeshArray);
            
            // Reset all visible cluster scales
            clusterMeshArray.forEach(mesh => {
                if (!this.visibleClusters.has(mesh.userData.clusterId)) {
                    mesh.scale.setScalar(1);
                }
            });
            
            if (clusterIntersects.length > 0) {
                const hoveredCluster = clusterIntersects[0].object;
                if (!this.visibleClusters.has(hoveredCluster.userData.clusterId)) {
                    hoveredCluster.scale.setScalar(1.2);
                }
                document.body.style.cursor = 'pointer';
                return;
            }
        }

        // Check for document intersections - only visible ones
        const meshes = Array.from(this.documentMeshes.values()).filter(mesh => mesh.visible);
        const intersects = this.raycaster.intersectObjects(meshes);

        // Reset all visible document scales
        meshes.forEach(mesh => {
            if (!this.highlightedDocuments.has(mesh.userData.documentId)) {
                mesh.scale.setScalar(1);
            }
        });

        // Highlight hovered document
        if (intersects.length > 0) {
            const hoveredMesh = intersects[0].object;
            if (!this.highlightedDocuments.has(hoveredMesh.userData.documentId)) {
                hoveredMesh.scale.setScalar(1.2);
            }
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    onMouseClick(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for cluster center clicks first - only visible ones
        if (this.clusterViewMode && this.clusterMeshes.size > 0) {
            const clusterMeshArray = Array.from(this.clusterMeshes.values()).filter(mesh => mesh.visible);
            const clusterIntersects = this.raycaster.intersectObjects(clusterMeshArray);
            
            if (clusterIntersects.length > 0) {
                const clickedCluster = clusterIntersects[0].object;
                const clusterId = clickedCluster.userData.clusterId;
                
                // Toggle cluster expansion
                this.toggleClusterExpansion(clusterId);
                return;
            }
        }

        // Check for document intersections - only visible ones
        const meshes = Array.from(this.documentMeshes.values()).filter(mesh => mesh.visible);
        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const document = clickedMesh.userData.document;
            
            // Dispatch event for document panel
            window.dispatchEvent(new CustomEvent('documentClicked', { detail: document }));
            
            // Visual feedback
            this.selectDocument(clickedMesh);
        }
    }

    selectDocument(mesh) {
        // Deselect previous
        if (this.selectedDocument && this.selectedDocument.material) {
            if (this.selectedDocument.material.emissive !== undefined) {
                this.selectedDocument.material.emissive = new THREE.Color(0x000000);
            }
        }

        // Select new
        this.selectedDocument = mesh;
        if (mesh && mesh.material && mesh.material.emissive !== undefined) {
            mesh.material.emissive = new THREE.Color(0xffff00);
            mesh.material.emissiveIntensity = 0.3;
        }
    }
    
    toggleClusterExpansion(clusterId) {
        console.log(`Toggling cluster ${clusterId}`);
        
        if (this.visibleClusters.has(clusterId)) {
            // Collapse cluster - hide documents
            this.visibleClusters.delete(clusterId);
            this.hideClusterDocuments(clusterId);
            
            // Restore cluster center opacity
            const clusterMesh = this.clusterMeshes.get(clusterId);
            if (clusterMesh) {
                clusterMesh.material.opacity = 0.8;
            }
        } else {
            // Expand cluster - show documents
            this.visibleClusters.add(clusterId);
            this.showClusterDocuments(clusterId);
            
            // Reduce cluster center opacity
            const clusterMesh = this.clusterMeshes.get(clusterId);
            if (clusterMesh) {
                clusterMesh.material.opacity = 0.3;
                
                // Animate expansion
                this.animateClusterExpansion(clusterMesh);
            }
        }
    }
    
    showClusterDocuments(clusterId) {
        const documents = this.documentsByCluster.get(clusterId) || [];
        console.log(`Showing ${documents.length} documents for cluster ${clusterId}`);
        
        documents.forEach(doc => {
            if (!this.documentMeshes.has(doc.id)) {
                this.createDocumentMesh(doc);
            } else {
                const mesh = this.documentMeshes.get(doc.id);
                mesh.visible = true;
                if (mesh.userData.label) {
                    mesh.userData.label.visible = true;
                }
            }
        });
    }
    
    hideClusterDocuments(clusterId) {
        const documents = this.documentsByCluster.get(clusterId) || [];
        console.log(`Hiding ${documents.length} documents for cluster ${clusterId}`);
        
        documents.forEach(doc => {
            const mesh = this.documentMeshes.get(doc.id);
            if (mesh) {
                mesh.visible = false;
                if (mesh.userData.label) {
                    mesh.userData.label.visible = false;
                }
            }
        });
    }
    
    animateClusterExpansion(clusterMesh) {
        // Create a pulse effect on the cluster
        const originalScale = clusterMesh.scale.x;
        const targetScale = originalScale * 1.3;
        let scale = originalScale;
        let growing = true;
        let frames = 0;
        const maxFrames = 20;
        
        const animate = () => {
            if (frames >= maxFrames) return;
            
            if (growing) {
                scale += (targetScale - originalScale) / 10;
                if (scale >= targetScale) {
                    growing = false;
                }
            } else {
                scale -= (targetScale - originalScale) / 10;
            }
            
            clusterMesh.scale.set(scale, scale, scale);
            frames++;
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    resetClusterView() {
        console.log('Resetting cluster view to show all clusters');
        
        // Show all cluster centers
        this.clusterMeshes.forEach((mesh, cId) => {
            mesh.visible = true;
            mesh.material.opacity = 0.8;
        });
        
        // Show all cluster labels
        if (this.clusterLabels) {
            this.clusterLabels.forEach(label => {
                label.visible = true;
            });
        }
        
        // Hide all documents
        this.documentMeshes.forEach((mesh, id) => {
            mesh.visible = false;
            if (mesh.userData.label) {
                mesh.userData.label.visible = false;
            }
        });
        
        // Clear visible clusters
        this.visibleClusters.clear();
        
        // Focus camera on all clusters
        this.focusOnClusters();
    }
    
    analyzeClusterQuality() {
        console.log('Analyzing cluster quality based on document connections...');
        
        if (!this.connections || this.connections.length === 0) {
            console.log('No connections loaded yet');
            return;
        }
        
        // Build a map of document connections
        const docConnections = new Map();
        
        this.connections.forEach(conn => {
            if (!docConnections.has(conn.source_id)) {
                docConnections.set(conn.source_id, []);
            }
            if (!docConnections.has(conn.target_id)) {
                docConnections.set(conn.target_id, []);
            }
            
            docConnections.get(conn.source_id).push({
                target: conn.target_id,
                strength: conn.strength
            });
            docConnections.get(conn.target_id).push({
                target: conn.source_id,
                strength: conn.strength
            });
        });
        
        // Analyze each document's cluster assignment
        let misclusteredDocs = [];
        
        this.documents.forEach(doc => {
            const docId = doc.id;
            const currentCluster = doc.cluster;
            const connections = docConnections.get(docId) || [];
            
            // Count connections to each cluster
            const clusterConnections = new Map();
            let strongestConnection = { cluster: currentCluster, avgStrength: 0, count: 0 };
            
            connections.forEach(conn => {
                const targetDoc = this.documents.find(d => d.id === conn.target);
                if (targetDoc) {
                    const targetCluster = targetDoc.cluster;
                    if (!clusterConnections.has(targetCluster)) {
                        clusterConnections.set(targetCluster, { total: 0, count: 0 });
                    }
                    clusterConnections.get(targetCluster).total += conn.strength;
                    clusterConnections.get(targetCluster).count += 1;
                }
            });
            
            // Find the cluster with strongest average connection
            clusterConnections.forEach((stats, clusterId) => {
                const avgStrength = stats.total / stats.count;
                if (avgStrength > strongestConnection.avgStrength) {
                    strongestConnection = { cluster: clusterId, avgStrength, count: stats.count };
                }
            });
            
            // Check if document might be misclustered
            if (strongestConnection.cluster !== currentCluster && strongestConnection.avgStrength > 0.8) {
                misclusteredDocs.push({
                    id: docId,
                    title: doc.metadata?.title || doc.metadata?.filename,
                    currentCluster,
                    suggestedCluster: strongestConnection.cluster,
                    connectionStrength: strongestConnection.avgStrength,
                    connectionCount: strongestConnection.count
                });
            }
        });
        
        if (misclusteredDocs.length > 0) {
            console.log(`Found ${misclusteredDocs.length} potentially misclustered documents:`);
            misclusteredDocs.forEach(doc => {
                console.log(`  "${doc.title}": Cluster ${doc.currentCluster} → ${doc.suggestedCluster} (${doc.connectionCount} connections, avg strength: ${doc.connectionStrength.toFixed(2)})`);
            });
        } else {
            console.log('Cluster assignments appear optimal based on current connections');
        }
        
        return misclusteredDocs;
    }
    
    async reclusterBySimilarity() {
        console.log('Re-clustering documents based on actual similarities...');
        
        // Use all connections if available, otherwise current connections
        const connections = this.allConnections || this.connections || [];
        
        if (connections.length === 0) {
            console.log('No connections available. Loading connections first...');
            // Temporarily increase max connections to get better data
            const originalMax = this.maxConnections;
            this.maxConnections = 1000;
            await this.loadConnections();
            this.maxConnections = originalMax;
        }
        
        // Build similarity matrix
        const similarityMatrix = new Map();
        
        (this.allConnections || this.connections).forEach(conn => {
            const key1 = `${conn.source_id}-${conn.target_id}`;
            const key2 = `${conn.target_id}-${conn.source_id}`;
            similarityMatrix.set(key1, conn.strength);
            similarityMatrix.set(key2, conn.strength);
        });
        
        // Perform agglomerative clustering
        const newClusters = this.performAgglomerativeClustering(similarityMatrix);
        
        // Update document clusters
        let changedCount = 0;
        this.documents.forEach(doc => {
            const newCluster = newClusters.get(doc.id);
            if (newCluster !== undefined && newCluster !== doc.cluster) {
                console.log(`Moving "${doc.metadata?.title || doc.metadata?.filename}" from cluster ${doc.cluster} to ${newCluster}`);
                doc.cluster = newCluster;
                changedCount++;
            }
        });
        
        console.log(`Re-clustering complete. ${changedCount} documents moved to new clusters.`);
        
        // Rebuild the documentsByCluster map
        this.documentsByCluster.clear();
        this.documents.forEach(doc => {
            const clusterId = doc.cluster !== undefined ? doc.cluster : -1;
            if (!this.documentsByCluster.has(clusterId)) {
                this.documentsByCluster.set(clusterId, []);
            }
            this.documentsByCluster.get(clusterId).push(doc);
        });
        
        // Refresh the visualization
        this.clearVisualElements();
        await this.loadConnections();
        
        console.log('New cluster distribution:');
        this.documentsByCluster.forEach((docs, clusterId) => {
            console.log(`  Cluster ${clusterId}: ${docs.length} documents`);
        });
        
        return changedCount;
    }
    
    performAgglomerativeClustering(similarityMatrix, targetClusters = 10) {
        // Simple agglomerative clustering based on similarity
        const clusters = new Map();
        const clusterMembers = new Map();
        
        // Initialize: each document is its own cluster
        let clusterIdCounter = 0;
        this.documents.forEach(doc => {
            clusters.set(doc.id, clusterIdCounter);
            clusterMembers.set(clusterIdCounter, [doc.id]);
            clusterIdCounter++;
        });
        
        // Merge clusters until we reach target number
        while (clusterMembers.size > targetClusters) {
            // Find the pair of clusters with highest average similarity
            let bestMerge = { cluster1: -1, cluster2: -1, similarity: -1 };
            
            const clusterIds = Array.from(clusterMembers.keys());
            for (let i = 0; i < clusterIds.length; i++) {
                for (let j = i + 1; j < clusterIds.length; j++) {
                    const cluster1Docs = clusterMembers.get(clusterIds[i]);
                    const cluster2Docs = clusterMembers.get(clusterIds[j]);
                    
                    // Calculate average similarity between clusters
                    let totalSim = 0;
                    let count = 0;
                    
                    cluster1Docs.forEach(doc1 => {
                        cluster2Docs.forEach(doc2 => {
                            const key = `${doc1}-${doc2}`;
                            const sim = similarityMatrix.get(key) || 0;
                            totalSim += sim;
                            count++;
                        });
                    });
                    
                    const avgSim = count > 0 ? totalSim / count : 0;
                    
                    if (avgSim > bestMerge.similarity) {
                        bestMerge = {
                            cluster1: clusterIds[i],
                            cluster2: clusterIds[j],
                            similarity: avgSim
                        };
                    }
                }
            }
            
            // Merge the best pair
            if (bestMerge.cluster1 !== -1) {
                const docs1 = clusterMembers.get(bestMerge.cluster1);
                const docs2 = clusterMembers.get(bestMerge.cluster2);
                
                // Merge cluster2 into cluster1
                docs2.forEach(docId => {
                    clusters.set(docId, bestMerge.cluster1);
                    docs1.push(docId);
                });
                
                // Remove cluster2
                clusterMembers.delete(bestMerge.cluster2);
            } else {
                // No more merges possible
                break;
            }
        }
        
        // Renumber clusters to 0-9
        const finalClusters = new Map();
        const clusterRemap = new Map();
        let newId = 0;
        
        clusterMembers.forEach((docs, oldId) => {
            clusterRemap.set(oldId, newId);
            newId++;
        });
        
        clusters.forEach((clusterId, docId) => {
            finalClusters.set(docId, clusterRemap.get(clusterId) || 0);
        });
        
        return finalClusters;
    }
    
    toggleClusterViewMode() {
        this.clusterViewMode = !this.clusterViewMode;
        console.log(`Cluster view mode: ${this.clusterViewMode}`);
        
        if (this.clusterViewMode) {
            // Hide all documents
            this.documentMeshes.forEach((mesh, id) => {
                mesh.visible = false;
                if (mesh.userData.label) {
                    mesh.userData.label.visible = false;
                }
            });
            
            // Show cluster centers
            this.clusterMeshes.forEach(mesh => {
                mesh.visible = true;
                mesh.material.opacity = 0.8;
            });
            
            // Clear expanded clusters
            this.visibleClusters.clear();
        } else {
            // Show all documents
            this.documentMeshes.forEach((mesh, id) => {
                mesh.visible = true;
                if (mesh.userData.label) {
                    mesh.userData.label.visible = true;
                }
            });
            
            // Hide or fade cluster centers
            this.clusterMeshes.forEach(mesh => {
                mesh.material.opacity = 0.2;
            });
        }
        
        return this.clusterViewMode;
    }

    updateDocuments(documents) {
        console.log(`Updating scene with ${documents.length} documents`);
        
        // Store documents first
        this.documents = documents;
        
        // Group documents by cluster BEFORE clearing
        this.documentsByCluster.clear();
        documents.forEach(doc => {
            const clusterId = doc.cluster !== undefined ? doc.cluster : -1;
            if (!this.documentsByCluster.has(clusterId)) {
                this.documentsByCluster.set(clusterId, []);
            }
            this.documentsByCluster.get(clusterId).push(doc);
        });
        
        console.log(`Found ${this.documentsByCluster.size} clusters`);
        console.log('Clusters:', Array.from(this.documentsByCluster.keys()));
        
        // Log cluster distribution
        this.documentsByCluster.forEach((docs, clusterId) => {
            console.log(`Cluster ${clusterId}: ${docs.length} documents`);
        });
        
        // Clear existing visual elements but keep the document data
        this.clearVisualElements();

        // In cluster view mode, don't create document meshes initially
        if (!this.clusterViewMode) {
            // Create document meshes
            documents.forEach((doc, index) => {
                console.log(`Creating mesh ${index} for doc ${doc.id}:`, doc.position);
                this.createDocumentMesh(doc);
            });
            console.log(`Total meshes in scene: ${this.documentMeshes.size}`);
        } else {
            console.log('Cluster view mode: Documents stored but not displayed');
        }
        
        // Get and display connections
        this.loadConnections();
    }

    // Create upload particle explosion effect
    createUploadExplosion(position) {
        const particleCount = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        
        // Initialize particles at upload position
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
            
            // Random velocities for explosion
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 0.1 + Math.random() * 0.2;
            
            velocities.push({
                x: Math.sin(phi) * Math.cos(theta) * speed,
                y: Math.sin(phi) * Math.sin(theta) * speed,
                z: Math.cos(phi) * speed
            });
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0x667eea,
            size: 0.1,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        
        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        
        // Animate explosion
        let frame = 0;
        const maxFrames = 60;
        
        const animateExplosion = () => {
            if (frame >= maxFrames) {
                this.scene.remove(particles);
                geometry.dispose();
                material.dispose();
                return;
            }
            
            const positions = particles.geometry.attributes.position.array;
            
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += velocities[i].x;
                positions[i * 3 + 1] += velocities[i].y;
                positions[i * 3 + 2] += velocities[i].z;
                
                // Add gravity
                velocities[i].y -= 0.002;
            }
            
            particles.geometry.attributes.position.needsUpdate = true;
            material.opacity = 1 - (frame / maxFrames);
            
            frame++;
            requestAnimationFrame(animateExplosion);
        };
        
        animateExplosion();
    }
    
    createDocumentMesh(doc) {
        const position = doc.position || { x: 0, y: 0, z: 0 };
        
        // Add small random offset if position is at origin to prevent overlap
        if (position.x === 0 && position.y === 0 && position.z === 0) {
            position.x += (Math.random() - 0.5) * 2;
            position.y += (Math.random() - 0.5) * 2;
            position.z += (Math.random() - 0.5) * 2;
        }
        
        console.log(`Mesh position for ${doc.id}: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
        
        // Choose geometry based on file type with more distinctive shapes
        let geometry;
        const fileType = doc.metadata.file_type || 'unknown';
        
        switch (fileType) {
            case 'pdf':
                // Cube representing a document
                geometry = new THREE.BoxGeometry(0.8, 1, 0.2);
                break;
            case 'image':
                // Flat plane representing a photo
                geometry = new THREE.PlaneGeometry(1, 0.8);
                break;
            case 'text':
                // Octahedron for text files
                geometry = new THREE.OctahedronGeometry(0.6, 0);
                break;
            case 'audio':
                // Cylinder representing sound waves
                geometry = new THREE.CylinderGeometry(0.3, 0.5, 0.8, 16);
                break;
            case 'video':
                // Cone for video files
                geometry = new THREE.ConeGeometry(0.5, 1, 6);
                break;
            default:
                // Sphere for unknown types
                geometry = new THREE.SphereGeometry(0.5, 16, 16);
        }

        // Color based on file type with theme support
        const colors = this.fileTypeColors[this.currentTheme];
        const color = colors[fileType] || colors.unknown;

        // Create material
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: 0x000000,
            specular: 0x111111,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Store document reference
        mesh.userData = {
            document: doc,
            documentId: doc.id,
            originalColor: color
        };

        // Add to scene and map
        this.scene.add(mesh);
        this.documentMeshes.set(doc.id, mesh);
        
        console.log(`Added mesh at position: (${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`);
        
        // Create particle explosion effect for new document
        this.createUploadExplosion(mesh.position);

        // Add label (optional)
        this.addDocumentLabel(doc, mesh);
    }

    addDocumentLabel(doc, mesh) {
        // Create sprite for label
        const canvas = window.document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        // Draw text with theme colors
        const theme = this.themes[this.currentTheme];
        context.fillStyle = theme.text;
        context.font = '20px Arial';
        context.textAlign = 'center';
        
        // Add text outline for better readability
        context.strokeStyle = theme.textOutline;
        context.lineWidth = 2;
        
        const title = doc.metadata.title || doc.metadata.filename;
        const displayTitle = title.length > 20 ? title.substring(0, 20) + '...' : title;
        context.strokeText(displayTitle, 128, 32);
        context.fillText(displayTitle, 128, 32);

        // Create texture and sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture, 
            transparent: true,
            opacity: 0.8
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        sprite.scale.set(2, 0.5, 1);
        sprite.position.copy(mesh.position);
        sprite.position.y += 1;
        
        // Store reference
        mesh.userData.label = sprite;
        this.scene.add(sprite);
    }

    async loadConnections() {
        try {
            const spatial = await API.getSpatialLayout(this.connectionThreshold);
            console.log(`Loading ${spatial.connections.length} connections`);
            
            // Store all connections for analysis
            this.allConnections = spatial.connections;
            
            // Only display if connections are visible
            if (this.connectionsVisible) {
                // Limit connections if too many
                let connectionsToShow = spatial.connections;
                if (connectionsToShow.length > this.maxConnections) {
                    // Sort by strength and take strongest connections
                    connectionsToShow = connectionsToShow
                        .sort((a, b) => (b.strength || 0) - (a.strength || 0))
                        .slice(0, this.maxConnections);
                    console.log(`Limited to ${this.maxConnections} strongest connections`);
                }
                this.displayConnections(connectionsToShow);
            } else {
                // Still store connections for analysis even if not displaying
                this.connections = spatial.connections;
            }
            
            // Also load and display cluster centers
            if (spatial.clusters) {
                this.displayClusterCenters(spatial.clusters);
            }
        } catch (error) {
            console.error('Failed to load connections:', error);
        }
    }
    
    updateConnections(connections) {
        // Store connections for later use
        this.connections = connections;
        
        // Only display if connections are visible
        if (this.connectionsVisible) {
            // Limit connections if too many
            let connectionsToShow = connections;
            if (connectionsToShow.length > this.maxConnections) {
                // Sort by strength and take strongest connections
                connectionsToShow = connectionsToShow
                    .sort((a, b) => (b.strength || 0) - (a.strength || 0))
                    .slice(0, this.maxConnections);
                console.log(`Limited to ${this.maxConnections} strongest connections`);
            }
            this.displayConnections(connectionsToShow);
        }
    }

    displayConnections(connections) {
        // Clear existing connections
        this.clearConnections();
        
        // Save connections for later reference
        this.connections = connections;
        
        // Track cross-cluster connections
        const crossClusterConnections = [];

        connections.forEach(conn => {
            const sourceMesh = this.documentMeshes.get(conn.source_id);
            const targetMesh = this.documentMeshes.get(conn.target_id);

            if (sourceMesh && targetMesh) {
                // Check if this is a cross-cluster connection
                const sourceCluster = sourceMesh.userData.document?.cluster;
                const targetCluster = targetMesh.userData.document?.cluster;
                
                if (sourceCluster !== undefined && targetCluster !== undefined && sourceCluster !== targetCluster) {
                    crossClusterConnections.push({
                        source: conn.source_id,
                        target: conn.target_id,
                        sourceCluster,
                        targetCluster,
                        strength: conn.strength
                    });
                }
                
                this.createConnectionLine(sourceMesh, targetMesh, conn.strength);
            }
        });
        
        if (crossClusterConnections.length > 0) {
            console.log(`Found ${crossClusterConnections.length} cross-cluster connections:`);
            crossClusterConnections.forEach(conn => {
                console.log(`  Cluster ${conn.sourceCluster} <-> Cluster ${conn.targetCluster}: strength ${conn.strength.toFixed(2)}`);
            });
        }
    }

    createConnectionLine(source, target, strength) {
        // Create a more visible line with better geometry
        const points = [];
        points.push(source.position);
        points.push(target.position);
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Color gradient based on strength
        const hue = strength * 0.3; // 0 to 0.3 (red to green)
        const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
        
        // Use LineBasicMaterial with better visibility
        const material = new THREE.LineBasicMaterial({
            color: color,
            opacity: 0.3 + strength * 0.4, // More visible
            transparent: true,
            linewidth: 2 // Note: linewidth doesn't work in WebGL, but keeping for compatibility
        });

        const line = new THREE.Line(geometry, material);
        
        // Add a glow effect using a tube geometry for better visibility
        const curve = new THREE.LineCurve3(source.position, target.position);
        const tubeGeometry = new THREE.TubeGeometry(curve, 2, 0.05 + strength * 0.1, 4, false);
        const tubeMaterial = new THREE.MeshBasicMaterial({
            color: color,
            opacity: 0.2 + strength * 0.3,
            transparent: true
        });
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        
        this.scene.add(tube);
        this.connectionLines.push(tube);
    }

    clearVisualElements() {
        console.log(`Clearing visual elements: ${this.documentMeshes.size} document meshes, ${this.clusterMeshes.size} cluster meshes`);
        
        // Remove document meshes
        this.documentMeshes.forEach((mesh, id) => {
            if (mesh.userData.label) {
                this.scene.remove(mesh.userData.label);
                mesh.userData.label.material.dispose();
                mesh.userData.label.geometry?.dispose();
            }
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.documentMeshes.clear();
        
        // Clear cluster meshes
        this.clusterMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.clusterMeshes.clear();
        
        // Reset visible clusters but keep documentsByCluster intact
        this.visibleClusters.clear();

        // Clear connections
        this.clearConnections();
        
        console.log('Visual elements cleared');
    }
    
    clearDocuments() {
        console.log(`Clearing all documents and data`);
        
        // Clear visual elements
        this.clearVisualElements();
        
        // Clear document data
        this.documentsByCluster.clear();
        this.documents = [];
        
        console.log('Documents and clusters cleared');
    }

    clearConnections() {
        this.connectionLines.forEach(line => {
            this.scene.remove(line);
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });
        this.connectionLines = [];
    }
    
    displayClusterCenters(clusters) {
        console.log(`Displaying cluster centers - received ${clusters.length} from API`);
        
        // Remove old cluster labels and meshes if any
        if (this.clusterLabels) {
            this.clusterLabels.forEach(label => {
                this.scene.remove(label);
                if (label.material) label.material.dispose();
                if (label.geometry) label.geometry.dispose();
            });
        }
        if (this.clusterMeshes.size > 0) {
            this.clusterMeshes.forEach(mesh => {
                this.scene.remove(mesh);
                if (mesh.material) mesh.material.dispose();
                if (mesh.geometry) mesh.geometry.dispose();
            });
            this.clusterMeshes.clear();
        }
        this.clusterLabels = [];
        this.clusterCenters = [];
        
        // Create cluster centers for ALL clusters we have documents for
        // Calculate centers from actual document positions if not provided
        this.documentsByCluster.forEach((docs, clusterId) => {
            if (docs.length === 0) return;
            
            // Try to find this cluster in the API response
            let cluster = clusters.find(c => c.cluster_id === clusterId);
            
            // If not found, calculate center from documents
            if (!cluster) {
                let centerX = 0, centerY = 0, centerZ = 0;
                docs.forEach(doc => {
                    if (doc.position) {
                        centerX += doc.position.x;
                        centerY += doc.position.y;
                        centerZ += doc.position.z;
                    }
                });
                centerX /= docs.length;
                centerY /= docs.length;
                centerZ /= docs.length;
                
                cluster = {
                    cluster_id: clusterId,
                    size: docs.length,
                    center: { x: centerX, y: centerY, z: centerZ },
                    label: `Cluster ${clusterId}`
                };
            }
            
            console.log(`Creating cluster ${cluster.cluster_id} with ${cluster.size} documents at (${cluster.center.x.toFixed(2)}, ${cluster.center.y.toFixed(2)}, ${cluster.center.z.toFixed(2)})`);
            if (cluster.size > 0) {
                // Create a larger, interactive sphere at cluster center
                const centerGeometry = new THREE.SphereGeometry(1.5, 32, 32);
                
                // Generate unique color for each cluster
                const hue = (cluster.cluster_id * 137.5) % 360; // Golden angle for distribution
                const color = new THREE.Color().setHSL(hue / 360, 0.7, 0.5);
                
                const centerMaterial = new THREE.MeshPhongMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.3,
                    opacity: 0.8,
                    transparent: true,
                    specular: 0xffffff,
                    shininess: 100
                });
                
                const centerMesh = new THREE.Mesh(centerGeometry, centerMaterial);
                centerMesh.position.set(
                    cluster.center.x,
                    cluster.center.y,
                    cluster.center.z
                );
                
                // Store cluster data in mesh
                centerMesh.userData = {
                    isClusterCenter: true,
                    clusterId: cluster.cluster_id,
                    clusterSize: cluster.size,
                    clusterLabel: cluster.label || `Cluster ${cluster.cluster_id}`,
                    originalColor: color.getHex()
                };
                
                this.scene.add(centerMesh);
                this.clusterMeshes.set(cluster.cluster_id, centerMesh);
                this.clusterLabels.push(centerMesh);
                console.log(`Added cluster ${cluster.cluster_id} mesh to scene`);
                
                // Store cluster center for galaxy mode
                this.clusterCenters[cluster.cluster_id] = {
                    x: cluster.center.x,
                    y: cluster.center.y,
                    z: cluster.center.z
                };
                
                // Create text label for cluster
                const canvas = window.document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = 256;
                canvas.height = 64;
                
                const theme = this.themes[this.currentTheme];
                context.fillStyle = theme.text;
                context.strokeStyle = theme.textOutline;
                context.lineWidth = 2;
                context.font = 'Bold 20px Arial';
                context.textAlign = 'center';
                
                // Display cluster theme if available
                const clusterLabel = cluster.label || `Cluster ${cluster.cluster_id}`;
                context.strokeText(clusterLabel, 128, 28);
                context.fillText(clusterLabel, 128, 28);
                context.font = '14px Arial';
                context.strokeText(`${cluster.size} documents`, 128, 48);
                context.fillText(`${cluster.size} documents`, 128, 48);
                
                // Add hint text
                context.font = '12px Arial';
                context.fillStyle = 'rgba(255, 255, 255, 0.7)';
                context.fillText('Click to explore', 128, 60);
                
                const texture = new THREE.CanvasTexture(canvas);
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0.9
                });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.scale.set(3, 0.75, 1);
                sprite.position.set(
                    cluster.center.x,
                    cluster.center.y + 2,
                    cluster.center.z
                );
                
                this.scene.add(sprite);
                this.clusterLabels.push(sprite);
            }
        });
        
        // Focus camera on clusters if in cluster view mode
        if (this.clusterViewMode && this.clusterMeshes.size > 0) {
            this.focusOnClusters();
        }
    }
    
    focusOnClusters() {
        if (this.clusterMeshes.size === 0) return;
        
        // Calculate bounding box of all clusters
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        this.clusterMeshes.forEach(mesh => {
            minX = Math.min(minX, mesh.position.x);
            minY = Math.min(minY, mesh.position.y);
            minZ = Math.min(minZ, mesh.position.z);
            maxX = Math.max(maxX, mesh.position.x);
            maxY = Math.max(maxY, mesh.position.y);
            maxZ = Math.max(maxZ, mesh.position.z);
        });
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        const distance = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 2;
        
        // Set camera position
        this.camera.position.set(centerX + distance, centerY + distance, centerZ + distance);
        this.camera.lookAt(centerX, centerY, centerZ);
        this.controls.target.set(centerX, centerY, centerZ);
        this.controls.update();
        
        console.log(`Camera focused on ${this.clusterMeshes.size} clusters`);
    }
    
    animateCameraToPosition(targetPosition, lookAtPosition) {
        // Smooth camera animation to target position
        const startPosition = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        
        const duration = 1000; // 1 second animation
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-in-out curve
            const eased = progress < 0.5 
                ? 2 * progress * progress 
                : -1 + (4 - 2 * progress) * progress;
            
            // Interpolate camera position
            this.camera.position.lerpVectors(startPosition, targetPosition, eased);
            
            // Interpolate look-at target
            if (lookAtPosition) {
                this.controls.target.lerpVectors(startTarget, lookAtPosition, eased);
                this.camera.lookAt(this.controls.target);
            }
            
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    highlightDocuments(documentIds) {
        // Clear previous highlights
        this.clearHighlights();
        
        // First, hide or dim ALL documents
        this.documentMeshes.forEach((mesh, id) => {
            if (!documentIds.includes(id)) {
                // Hide non-matching documents
                mesh.visible = false;
                // Also hide their labels if they exist
                if (mesh.userData.label) {
                    mesh.userData.label.visible = false;
                }
            }
        });

        // Then highlight and show only matching documents
        documentIds.forEach(id => {
            const mesh = this.documentMeshes.get(id);
            if (mesh) {
                this.highlightedDocuments.add(id);
                mesh.visible = true;
                if (mesh.userData.label) {
                    mesh.userData.label.visible = true;
                }
                if (mesh && mesh.material && mesh.material.emissive !== undefined) {
                    mesh.material.emissive = new THREE.Color(0xffff00);
                    mesh.material.emissiveIntensity = 0.5;
                }
                mesh.scale.setScalar(1.5);
            }
        });
        
        // Also hide connections if in search mode
        if (documentIds.length > 0) {
            this.connectionLines.forEach(line => {
                if (line) line.visible = false;
            });
        }
    }

    clearHighlights() {
        // Reset highlighted documents
        this.highlightedDocuments.forEach(id => {
            const mesh = this.documentMeshes.get(id);
            if (mesh && mesh.material) {
                if (mesh.material.emissive !== undefined) {
                    mesh.material.emissive = new THREE.Color(0x000000);
                    mesh.material.emissiveIntensity = 0;
                }
                mesh.scale.setScalar(1);
            }
        });
        this.highlightedDocuments.clear();
        
        // Show all documents again
        this.documentMeshes.forEach((mesh, id) => {
            mesh.visible = true;
            if (mesh.userData.label) {
                mesh.userData.label.visible = true;
            }
        });
        
        // Restore connections visibility based on settings
        if (this.connectionsVisible) {
            this.connectionLines.forEach(line => {
                if (line) line.visible = true;
            });
        }
    }

    focusOnPosition(position) {
        if (!position) return;

        // Animate camera to look at position
        const targetPosition = new THREE.Vector3(position.x, position.y, position.z);
        const cameraOffset = new THREE.Vector3(5, 5, 5);
        const cameraTarget = targetPosition.clone().add(cameraOffset);

        // Smooth camera transition
        const duration = 1000; // ms
        const startPosition = this.camera.position.clone();
        const startTime = Date.now();

        const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            this.camera.position.lerpVectors(startPosition, cameraTarget, easeProgress);
            this.controls.target.lerp(targetPosition, easeProgress);
            this.controls.update();

            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        };

        animateCamera();
    }

    resetCamera() {
        // Directly set camera to default position without animation
        this.camera.position.set(15, 15, 15);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update controls
        this.controls.update();

        // Animation control
        if (!this.animationsPaused) {
            // Rotate particles
            if (this.particles) {
                this.particles.rotation.y += 0.0002;
            }
            
            // Galaxy mode orbiting
            if (this.galaxyMode) {
                this.animateGalaxyMode();
            }
        }

        // Animate highlighted documents
        this.highlightedDocuments.forEach(id => {
            const mesh = this.documentMeshes.get(id);
            if (mesh) {
                mesh.rotation.y += 0.02;
            }
        });

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    // Theme switching method
    setTheme(themeName) {
        if (!this.themes[themeName]) return;
        
        this.currentTheme = themeName;
        const theme = this.themes[themeName];
        
        // Update background and fog
        this.scene.background = new THREE.Color(theme.background);
        this.scene.fog = new THREE.Fog(theme.fog, 10, 100);
        
        // Update ambient light
        if (this.ambientLight) {
            this.ambientLight.color = new THREE.Color(theme.ambient);
            this.ambientLight.intensity = themeName === 'dark' ? 1.5 : 2;
        }
        
        // Update grid
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper = new THREE.GridHelper(40, 40, theme.grid.main, theme.grid.sub);
            this.gridHelper.position.y = -10;
            this.scene.add(this.gridHelper);
        }
        
        // Update particles
        if (this.particles) {
            this.particles.material.color = new THREE.Color(theme.particles);
            this.particles.material.opacity = themeName === 'dark' ? 0.3 : 0.2;
        }
        
        // Recreate all document meshes with new colors
        const docs = [...this.documents];
        this.clearDocuments();
        docs.forEach(doc => this.createDocumentMesh(doc));
        
        // Reload connections and clusters
        this.loadConnections();
    }
    
    // Utility methods
    setBackgroundColor(color) {
        this.scene.background = new THREE.Color(color);
        this.scene.fog = new THREE.Fog(color, 10, 100);
    }

    toggleWireframe() {
        this.documentMeshes.forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.wireframe = !mesh.material.wireframe;
                mesh.material.needsUpdate = true;
            }
        });
    }
    
    // Connection visibility controls
    toggleConnections() {
        this.connectionsVisible = !this.connectionsVisible;
        
        if (this.connectionsVisible) {
            // Reload and show connections
            this.loadConnections();
        } else {
            // Hide all connections
            this.connectionLines.forEach(line => {
                if (line) {
                    line.visible = false;
                }
            });
        }
        
        return this.connectionsVisible;
    }
    
    setConnectionThreshold(threshold) {
        this.connectionThreshold = Math.max(0.5, Math.min(0.95, threshold));
        if (this.connectionsVisible) {
            // Reload connections with new threshold
            this.loadConnections();
        }
    }
    
    setMaxConnections(max) {
        this.maxConnections = Math.max(10, Math.min(1000, max));
        if (this.connectionsVisible) {
            // Reload connections with new limit
            this.loadConnections();
        }
    }
    
    showConnectionsForDocument(documentId) {
        // Hide all connections first
        this.connectionLines.forEach(line => {
            if (line) {
                line.visible = false;
            }
        });
        
        // Show only connections for the specified document
        this.connections.forEach((conn, index) => {
            if (conn.source_id === documentId || conn.target_id === documentId) {
                const line = this.connectionLines[index];
                if (line) {
                    line.visible = true;
                }
            }
        });
    }

    // Galaxy Mode - Documents orbit around cluster centers
    enableGalaxyMode() {
        this.galaxyMode = true;
        console.log('Galaxy Mode enabled');
        
        // Calculate orbits for each document
        this.clusterCenters.forEach((center, clusterId) => {
            const clusterDocs = Array.from(this.documentMeshes.values()).filter(
                mesh => mesh.userData.document.cluster === clusterId
            );
            
            clusterDocs.forEach((doc, i) => {
                const radius = 3 + Math.random() * 2;
                const speed = 0.001 + Math.random() * 0.002;
                const angle = (Math.PI * 2 * i) / clusterDocs.length;
                const yOffset = (Math.random() - 0.5) * 2;
                
                this.documentOrbits.set(doc.userData.documentId, {
                    center: center,
                    radius: radius,
                    speed: speed,
                    angle: angle,
                    yOffset: yOffset
                });
            });
        });
    }
    
    disableGalaxyMode() {
        this.galaxyMode = false;
        console.log('Galaxy Mode disabled');
        // Reset positions
        this.documentMeshes.forEach((mesh, id) => {
            const doc = mesh.userData.document;
            if (doc.position) {
                mesh.position.set(doc.position.x, doc.position.y, doc.position.z);
            }
        });
    }
    
    animateGalaxyMode() {
        const time = Date.now() * 0.001;
        
        this.documentOrbits.forEach((orbit, docId) => {
            const mesh = this.documentMeshes.get(docId);
            if (mesh && orbit.center) {
                const angle = orbit.angle + time * orbit.speed;
                mesh.position.x = orbit.center.x + Math.cos(angle) * orbit.radius;
                mesh.position.y = orbit.center.y + orbit.yOffset + Math.sin(time * 2) * 0.3;
                mesh.position.z = orbit.center.z + Math.sin(angle) * orbit.radius;
                
                // Gentle rotation
                mesh.rotation.y += 0.01;
                mesh.rotation.x = Math.sin(time) * 0.1;
            }
        });
    }
    
    // X-Ray Vision Mode
    enableXRayMode() {
        this.xrayMode = true;
        console.log('X-Ray Mode enabled');
        
        this.documentMeshes.forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.transparent = true;
                mesh.material.opacity = 0.3;
                mesh.material.wireframe = true;
                mesh.material.needsUpdate = true;
            }
        });
        
        // Make connections more visible
        this.connectionLines.forEach(line => {
            if (line && line.material) {
                line.material.opacity = 0.8;
                if (line.material.emissive !== undefined) {
                    line.material.emissive = new THREE.Color(0x00ffff);
                    line.material.emissiveIntensity = 0.5;
                }
                line.material.needsUpdate = true;
            }
        });
    }
    
    disableXRayMode() {
        this.xrayMode = false;
        console.log('X-Ray Mode disabled');
        
        this.documentMeshes.forEach(mesh => {
            if (mesh && mesh.material) {
                mesh.material.transparent = true;
                mesh.material.opacity = 0.9;
                mesh.material.wireframe = false;
                mesh.material.needsUpdate = true;
            }
        });
        
        // Reset connections
        this.connectionLines.forEach(line => {
            if (line && line.material) {
                line.material.opacity = 0.3;
                if (line.material.emissive !== undefined) {
                    line.material.emissive = new THREE.Color(0x000000);
                    line.material.emissiveIntensity = 0;
                }
                line.material.needsUpdate = true;
            }
        });
    }
    
    // Heat Map Mode
    enableHeatMapMode() {
        this.heatMapMode = true;
        console.log('Heat Map Mode enabled');
        
        // Calculate cluster sizes
        const clusterSizes = new Map();
        let maxSize = 0;
        
        this.documents.forEach(doc => {
            const cluster = doc.cluster;
            if (cluster >= 0) {
                clusterSizes.set(cluster, (clusterSizes.get(cluster) || 0) + 1);
                maxSize = Math.max(maxSize, clusterSizes.get(cluster));
            }
        });
        
        // Apply heat colors
        const heatColors = [
            0x0000ff, // Cold - few docs
            0x00ffff, // Cool
            0x00ff00, // Medium
            0xffff00, // Warm
            0xff8800, // Hot
            0xff0000  // Very hot - many docs
        ];
        
        this.documentMeshes.forEach(mesh => {
            const cluster = mesh.userData.document.cluster;
            if (cluster >= 0 && clusterSizes.has(cluster)) {
                const density = clusterSizes.get(cluster) / maxSize;
                const colorIndex = Math.min(
                    Math.floor(density * heatColors.length),
                    heatColors.length - 1
                );
                
                if (mesh && mesh.material) {
                    if (mesh.material.emissive !== undefined) {
                        mesh.material.emissive = new THREE.Color(heatColors[colorIndex]);
                        mesh.material.emissiveIntensity = 0.5 + density * 0.3;
                    }
                    mesh.material.color = new THREE.Color(heatColors[colorIndex]);
                    mesh.material.needsUpdate = true;
                }
            }
        });
    }
    
    disableHeatMapMode() {
        this.heatMapMode = false;
        console.log('Heat Map Mode disabled');
        
        // Reset colors to original
        this.documentMeshes.forEach(mesh => {
            const originalColor = mesh.userData.originalColor;
            if (originalColor && mesh && mesh.material) {
                mesh.material.color = new THREE.Color(originalColor);
                if (mesh.material.emissive !== undefined) {
                    mesh.material.emissive = new THREE.Color(0x000000);
                    mesh.material.emissiveIntensity = 0;
                }
                mesh.material.needsUpdate = true;
            }
        });
    }
    
    // Toggle animation pause
    togglePause() {
        this.animationsPaused = !this.animationsPaused;
        console.log('Animations', this.animationsPaused ? 'paused' : 'resumed');
    }
    
    // Jump to cluster
    jumpToCluster(clusterId) {
        console.log(`Jumping to cluster ${clusterId}`);
        
        // In cluster view mode, expand the target cluster
        if (this.clusterViewMode) {
            // Check if we have documents for this cluster
            const docsInCluster = this.documentsByCluster.get(clusterId) || [];
            console.log(`Cluster ${clusterId} has ${docsInCluster.length} documents`);
            
            if (docsInCluster.length === 0) {
                console.log(`No documents found in cluster ${clusterId}`);
                return;
            }
            
            // Hide all cluster centers except the target one
            this.clusterMeshes.forEach((mesh, cId) => {
                const isTarget = cId === clusterId;
                mesh.visible = isTarget;
                mesh.material.opacity = isTarget ? 0.3 : 0.8; // Fade target cluster since we're showing its documents
                
                // Also hide cluster labels
                if (this.clusterLabels) {
                    this.clusterLabels.forEach(label => {
                        if (label.userData && label.userData.clusterId === cId) {
                            label.visible = isTarget;
                        }
                    });
                }
            });
            
            // Hide all other clusters and show only this one
            this.visibleClusters.clear();
            this.documentsByCluster.forEach((docs, cId) => {
                if (cId === clusterId) {
                    // Show this cluster's documents
                    if (!this.visibleClusters.has(cId)) {
                        this.visibleClusters.add(cId);
                        this.showClusterDocuments(cId);
                    }
                } else {
                    // Hide other clusters' documents
                    this.hideClusterDocuments(cId);
                }
            });
            
            // Focus on the cluster center if it exists
            const clusterMesh = this.clusterMeshes.get(clusterId);
            if (clusterMesh) {
                const pos = clusterMesh.position;
                this.animateCameraToPosition(
                    new THREE.Vector3(pos.x + 10, pos.y + 10, pos.z + 10),
                    pos
                );
            }
            
            return;
        }
        
        // Original behavior for non-cluster view mode
        let clusterCenter = this.clusterCenters[clusterId];
        let docsInCluster = 0;
        let totalDocs = 0;
        let centerSum = { x: 0, y: 0, z: 0 };
        
        // Hide all documents not in this cluster
        this.documentMeshes.forEach((mesh, docId) => {
            totalDocs++;
            const docCluster = mesh.userData.document?.cluster;
            const isInCluster = docCluster === clusterId;
            
            if (isInCluster) {
                docsInCluster++;
                centerSum.x += mesh.position.x;
                centerSum.y += mesh.position.y;
                centerSum.z += mesh.position.z;
            }
            
            mesh.visible = isInCluster;
            if (mesh.userData.label) {
                mesh.userData.label.visible = isInCluster;
            }
        });
        
        console.log(`Found ${docsInCluster} documents in cluster ${clusterId} out of ${totalDocs} total`);
        
        if (!clusterCenter && docsInCluster > 0) {
            clusterCenter = {
                x: centerSum.x / docsInCluster,
                y: centerSum.y / docsInCluster,
                z: centerSum.z / docsInCluster
            };
            this.clusterCenters[clusterId] = clusterCenter;
        }
        
        // Also hide connections for non-cluster documents
        if (this.connectionLines) {
            this.connectionLines.forEach(line => {
                line.visible = false; // Hide all connections when focusing on cluster
            });
        }
        
        // Focus camera on cluster center if it exists
        if (clusterCenter) {
            this.focusOnPosition(clusterCenter);
        } else {
            console.log(`No documents found in cluster ${clusterId}`);
        }
        
        // Store current cluster view for restoration
        this.currentClusterView = clusterId;
        
        // Force render update to prevent disappearing objects
        setTimeout(() => {
            this.renderer.render(this.scene, this.camera);
        }, 50);
    }
    
    // Show all documents (exit cluster view)
    showAllDocuments() {
        // Restore visibility for all documents
        this.documentMeshes.forEach((mesh, docId) => {
            mesh.visible = true;
            if (mesh.userData.label) {
                mesh.userData.label.visible = true;
            }
        });
        
        // Clear cluster view state
        this.currentClusterView = null;
        
        // Force render update
        this.renderer.render(this.scene, this.camera);
    }
    
    exportScene() {
        // Export scene data for debugging or analysis
        return {
            documents: this.documents,
            connections: this.connections,
            camera: {
                position: this.camera.position,
                rotation: this.camera.rotation
            }
        };
    }

    dispose() {
        // Clean up resources
        this.clearDocuments();
        this.renderer.dispose();
        this.controls.dispose();
        
        // Remove event listeners
        window.removeEventListener('resize', this.onWindowResize);
    }
    
    // Debug helper methods
    debugScene() {
        console.log('=== Scene Debug Info ===');
        console.log(`Total documents: ${this.documents.length}`);
        console.log(`Total meshes: ${this.documentMeshes.size}`);
        console.log(`Scene children: ${this.scene.children.length}`);
        
        // List all mesh positions
        this.documentMeshes.forEach((mesh, id) => {
            console.log(`Doc ${id.substring(0, 8)}: pos(${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`);
        });
        
        return {
            documents: this.documents.length,
            meshes: this.documentMeshes.size,
            sceneChildren: this.scene.children.length
        };
    }
    
    spreadDocuments() {
        // Spread out all documents if they're overlapping
        console.log('Spreading documents...');
        let index = 0;
        this.documentMeshes.forEach((mesh, id) => {
            const angle = (index / this.documentMeshes.size) * Math.PI * 2;
            const radius = 5 + (index % 5) * 2;
            
            mesh.position.x = Math.cos(angle) * radius;
            mesh.position.y = (index % 3 - 1) * 2;
            mesh.position.z = Math.sin(angle) * radius;
            
            index++;
        });
        console.log('Documents spread complete');
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryPalaceScene;
}