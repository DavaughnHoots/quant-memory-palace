from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional, Dict, Any
import os
import sys
import time
import traceback
from datetime import datetime
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import services
from services.qdrant_service import qdrant_service
from services.embedding_service import embedding_service
from services.file_processor import file_processor
from services.clustering import spatial_organizer

# Import models
from models.schemas import (
    Document, DocumentMetadata, FileType,
    UploadResponse, SearchQuery, SearchResponse, SearchResult,
    ClusterResponse, SpatialLayoutResponse,
    CollectionStats, ErrorResponse, DeleteResponse,
    HealthCheck, Position3D, Connection
)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Memory Palace API",
    version="1.0.0",
    description="A 3D spatial memory system for documents using vector embeddings"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving uploaded images
# Create uploads directory if it doesn't exist
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
if not os.path.exists(uploads_dir):
    os.makedirs(uploads_dir)

# Mount the uploads directory to serve static files
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    error_response = ErrorResponse(
        error=type(exc).__name__,
        message=str(exc),
        status_code=500,
        timestamp=datetime.utcnow()
    )
    return JSONResponse(
        status_code=500,
        content=error_response.dict()
    )

@app.get("/", response_model=Dict[str, Any])
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Memory Palace API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "upload": "/api/upload",
            "documents": "/api/documents",
            "search": "/api/search",
            "clusters": "/api/clusters",
            "spatial": "/api/spatial",
            "stats": "/api/stats"
        }
    }

@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint"""
    # Check services
    services_status = {
        "qdrant": False,
        "openai": False,
        "file_processor": True
    }
    
    # Check Qdrant
    try:
        info = qdrant_service.get_collection_info()
        services_status["qdrant"] = info is not None
    except:
        services_status["qdrant"] = False
    
    # Check OpenAI
    try:
        test_embedding = embedding_service.generate_embedding("test")
        services_status["openai"] = len(test_embedding) > 0
    except:
        services_status["openai"] = False
    
    return HealthCheck(
        status="healthy" if all(services_status.values()) else "degraded",
        services=services_status
    )

@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[str] = None
):
    """Upload and process a document"""
    try:
        # Read file content
        content = await file.read()

        # Process file
        processed = file_processor.process_file(
            content=content,
            filename=file.filename,
            content_type=file.content_type
        )

        # Save file if it's an image
        file_url = None
        if file.content_type and file.content_type.startswith('image/'):
            # Generate unique filename
            import uuid
            file_extension = os.path.splitext(file.filename)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            file_path = os.path.join(uploads_dir, unique_filename)

            # Save the file
            with open(file_path, "wb") as f:
                f.write(content)

            # Store the URL path
            file_url = f"/uploads/{unique_filename}"

        # Prepare metadata with content preview for clustering
        content_text = processed["content"]
        # Store a meaningful preview for theme extraction (first 2000 chars)
        content_preview = content_text[:2000] if len(content_text) > 2000 else content_text

        metadata = DocumentMetadata(
            title=title or file.filename,
            description=description,
            filename=file.filename,
            file_type=FileType(processed["metadata"].get("type", "unknown")),
            file_size=len(content),
            content_type=file.content_type,
            tags=tags.split(",") if tags else [],
            file_id=processed["metadata"]["file_id"],
            pages=processed["metadata"].get("pages"),
            word_count=processed["metadata"].get("words"),
            language=processed["metadata"].get("language")
        )

        # Add content preview to metadata dict for storage
        metadata_dict = metadata.dict()
        metadata_dict["content_preview"] = content_preview

        # Add file URL if it's an image
        if file_url:
            metadata_dict["file_url"] = file_url
        
        # Generate embedding
        embedding_result = embedding_service.generate_document_embedding(
            content=processed["content"],
            metadata=metadata_dict
        )
        
        # Store in Qdrant with content preview
        document_id = qdrant_service.add_document(
            embedding=embedding_result["embedding"],
            metadata=metadata_dict
        )
        
        # Calculate initial position (will be recalculated with all docs)
        all_docs = qdrant_service.get_all_documents(limit=100)
        if all_docs:
            embeddings = [doc["vector"] for doc in all_docs]
            positions = spatial_organizer.calculate_3d_positions(embeddings)
            position = positions[-1] if positions else None
        else:
            position = Position3D(x=0, y=0, z=0)
        
        return UploadResponse(
            success=True,
            document_id=document_id,
            message=f"Document '{file.filename}' uploaded successfully",
            metadata=metadata,
            position=position
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/documents/simple")
async def get_documents_simple(limit: int = 100):
    """Get documents without calculating positions - faster for large datasets"""
    try:
        print(f"Getting simple documents with limit: {limit}")
        # Get documents from Qdrant WITH vectors for clustering
        results = qdrant_service.client.scroll(
            collection_name=qdrant_service.collection_name,
            limit=limit,
            with_vectors=True,  # Need vectors for clustering
            with_payload=True
        )
        
        documents = []
        embeddings = []
        
        # Collect embeddings for clustering
        for point in results[0]:
            embeddings.append(point.vector)
        
        # Calculate clusters if we have documents
        if embeddings:
            print(f"Calculating clusters for {len(embeddings)} documents...")
            
            # For very large datasets, use simple hash-based clustering for speed
            if len(embeddings) > 200:
                print(f"Using fast hash-based clustering for {len(embeddings)} documents")
                n_clusters = 10
                # Use first few dimensions of embedding as a simple hash
                cluster_labels = []
                for emb in embeddings:
                    # Simple hash based on first 3 dimensions
                    hash_val = sum(emb[:3]) if len(emb) >= 3 else sum(emb)
                    cluster_id = int(abs(hash_val * 100)) % n_clusters
                    cluster_labels.append(cluster_id)
                print(f"Assigned {len(set(cluster_labels))} clusters using hash method")
            else:
                try:
                    # For smaller datasets, use proper clustering
                    if len(embeddings) <= 20:
                        n_clusters = min(3, len(embeddings) // 5 + 1)
                    elif len(embeddings) <= 100:
                        n_clusters = 5
                    else:
                        n_clusters = 8
                    
                    cluster_labels = spatial_organizer.cluster_documents(
                        embeddings, 
                        method="kmeans",
                        n_clusters=n_clusters
                    )
                    print(f"Calculated {len(set(cluster_labels))} unique clusters using kmeans")
                except Exception as e:
                    print(f"Clustering failed: {e}, using simple grouping")
                    # Simple fallback: group by document index
                    n_clusters = 5
                    cluster_labels = [i % n_clusters for i in range(len(embeddings))]
        else:
            cluster_labels = []
        
        # Create document objects with proper cluster assignments
        import random
        for i, point in enumerate(results[0]):
            doc = Document(
                id=str(point.id),
                metadata=DocumentMetadata(**point.payload),
                position=Position3D(
                    x=random.uniform(-10, 10),
                    y=random.uniform(-10, 10),
                    z=random.uniform(-10, 10)
                ),
                cluster=cluster_labels[i] if i < len(cluster_labels) else -1,
                content_preview=point.payload.get("content_preview", "")[:200],
                embedding_generated=True
            )
            documents.append(doc)
        
        print(f"Returning {len(documents)} simple documents with clusters")
        return documents
    except Exception as e:
        print(f"Error in get_documents_simple: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents", response_model=List[Document])
async def get_documents(
    limit: int = 100,
    file_type: Optional[FileType] = None,
    tags: Optional[str] = None
):
    """Get all documents with their 3D positions"""
    try:
        print(f"Getting documents with limit: {limit}")
        # Get documents from Qdrant
        documents = qdrant_service.get_all_documents(limit=limit)
        print(f"Retrieved {len(documents) if documents else 0} documents from Qdrant")
        
        if not documents:
            return []
        
        # Extract embeddings and metadata
        embeddings = [doc["vector"] for doc in documents]
        print(f"Extracted {len(embeddings)} embeddings")
        
        # Calculate 3D positions
        print("Calculating 3D positions...")
        positions = spatial_organizer.calculate_3d_positions(embeddings)
        print(f"Calculated {len(positions)} positions")
        
        # Calculate clusters
        print("Calculating clusters...")
        cluster_labels = spatial_organizer.cluster_documents(embeddings)
        print(f"Calculated {len(cluster_labels)} cluster labels")
        
        # Filter and format results
        result = []
        for i, doc in enumerate(documents):
            metadata = DocumentMetadata(**doc["metadata"])
            
            # Apply filters
            if file_type and metadata.file_type != file_type:
                continue
            if tags:
                tag_list = tags.split(",")
                if not any(tag in metadata.tags for tag in tag_list):
                    continue
            
            position = positions[i] if i < len(positions) else {"x": 0, "y": 0, "z": 0}
            
            result.append(Document(
                id=doc["id"],
                metadata=metadata,
                position=Position3D(**position),
                cluster=cluster_labels[i] if i < len(cluster_labels) else -1,
                content_preview=doc["metadata"].get("content_preview", "")[:200],
                embedding_generated=True
            ))
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search", response_model=SearchResponse)
async def search_documents(query: SearchQuery):
    """Search documents using semantic similarity"""
    try:
        start_time = time.time()
        
        # Generate query embedding
        query_embedding = embedding_service.generate_query_embedding(query.query)
        
        # Build filter
        filter_dict = {}
        if query.filter_type:
            filter_dict["file_type"] = query.filter_type
        
        # Search in Qdrant
        results = qdrant_service.search(
            query_vector=query_embedding,
            limit=query.limit,
            score_threshold=query.threshold,
            filter_dict=filter_dict if filter_dict else None
        )
        
        # Format results
        search_results = []
        for result in results:
            metadata = DocumentMetadata(**result["metadata"])
            
            # Apply tag filter if specified
            if query.filter_tags:
                if not any(tag in metadata.tags for tag in query.filter_tags):
                    continue
            
            doc = Document(
                id=result["id"],
                metadata=metadata,
                content_preview=result["metadata"].get("content_preview", "")[:200] if query.include_content else None,
                embedding_generated=True
            )
            
            search_results.append(SearchResult(
                document=doc,
                score=result["score"]
            ))
        
        processing_time = time.time() - start_time
        
        return SearchResponse(
            query=query.query,
            results=search_results,
            count=len(search_results),
            processing_time=processing_time
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clusters", response_model=ClusterResponse)
async def get_clusters(
    method: str = "hdbscan",
    n_clusters: Optional[int] = None
):
    """Get document clusters"""
    try:
        # Get all documents
        documents = qdrant_service.get_all_documents(limit=1000)
        
        if not documents:
            return ClusterResponse(clusters=[], count=0, method=method)
        
        # Extract embeddings
        embeddings = [doc["vector"] for doc in documents]
        
        # Calculate positions and clusters
        positions = spatial_organizer.calculate_3d_positions(embeddings)
        cluster_labels = spatial_organizer.cluster_documents(
            embeddings,
            method=method,
            n_clusters=n_clusters
        )
        
        # Calculate cluster info
        cluster_info = spatial_organizer._calculate_cluster_info(positions, cluster_labels)
        
        # Map document IDs to cluster info and extract themes
        clusters = []
        for info in cluster_info:
            document_ids = [documents[i]["id"] for i in info["document_indices"]]
            
            # Extract common themes/keywords from cluster documents
            cluster_docs = [documents[i] for i in info["document_indices"]]
            cluster_theme = extract_cluster_theme(cluster_docs)
            
            clusters.append({
                "cluster_id": info["cluster_id"],
                "center": info["center"],
                "size": info["size"],
                "document_ids": document_ids,
                "label": cluster_theme  # Add theme/keywords
            })
        
        return ClusterResponse(
            clusters=clusters,
            count=len(clusters),
            method=method
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def extract_cluster_theme(documents: List[Dict], max_words: int = 3) -> str:
    """Extract common theme/keywords from a cluster of documents using actual content"""
    from collections import Counter
    import re
    
    # Extended stop words list
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
                  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
                  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
                  'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
                  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
                  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any',
                  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
                  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
                  'just', 'also', 'now', 'then', 'once', 'here', 'there', 'about',
                  'after', 'again', 'further', 'into', 'through', 'during', 'before',
                  'above', 'below', 'between', 'under', 'along', 'following', 'behind',
                  'pdf', 'png', 'jpg', 'jpeg', 'file', 'document', 'page', 'text',
                  'image', 'screenshot', 'download', 'new', 'one', 'two', 'first'}
    
    word_counter = Counter()
    bigram_counter = Counter()
    
    for doc in documents:
        # Get text from metadata
        text = ""
        metadata = doc.get("metadata", {})
        
        # USE ACTUAL CONTENT PREVIEW if available
        if metadata.get("content_preview"):
            text = metadata["content_preview"]
        else:
            # Fallback to title and description
            if metadata.get("title"):
                text += metadata["title"] + " "
            if metadata.get("description"):
                text += metadata["description"] + " "
            # Only use filename as last resort, and clean it
            if not text.strip() and metadata.get("filename"):
                # Remove file extension and split on common separators
                filename = metadata["filename"]
                filename = re.sub(r'\.[^.]+$', '', filename)  # Remove extension
                filename = re.sub(r'[_-]', ' ', filename)  # Replace separators with spaces
                text += filename
        
        # Clean and extract words
        text = text.lower()
        # Remove special characters but keep spaces
        text = re.sub(r'[^a-z\s]+', ' ', text)
        # Extract words
        words = [w for w in text.split() if len(w) > 2 and w not in stop_words]
        
        # Count single words
        word_counter.update(words)
        
        # Extract meaningful bigrams (two-word phrases)
        for i in range(len(words) - 1):
            bigram = f"{words[i]} {words[i+1]}"
            bigram_counter.update([bigram])
    
    # Try to get the most meaningful theme
    themes = []
    
    # Check if any bigrams are common enough to be meaningful
    if bigram_counter:
        common_bigrams = [bigram for bigram, count in bigram_counter.most_common(2) if count > 1]
        if common_bigrams:
            # Use the most common bigram if it appears in multiple documents
            return common_bigrams[0].title()
    
    # Otherwise use most common single words
    if word_counter:
        # Filter out very common words that might have slipped through
        filtered_words = [(word, count) for word, count in word_counter.most_common(10) 
                         if count > 1 or len(list(word_counter.elements())) <= 3]
        
        if filtered_words:
            # Take top words based on frequency
            top_words = [word for word, _ in filtered_words[:max_words]]
            if top_words:
                return " ".join(top_words).title()
    
    # If we still have no theme, try to extract from filenames more intelligently
    filename_words = Counter()
    for doc in documents:
        metadata = doc.get("metadata", {})
        if metadata.get("filename"):
            filename = metadata["filename"]
            # Remove extension and split intelligently
            name_part = re.sub(r'\.[^.]+$', '', filename)
            # Split on camelCase, underscores, hyphens
            parts = re.findall(r'[A-Z][a-z]+|[a-z]+|[0-9]+', name_part)
            meaningful_parts = [p.lower() for p in parts if len(p) > 2 and p.lower() not in stop_words]
            filename_words.update(meaningful_parts)
    
    if filename_words:
        common = filename_words.most_common(max_words)
        if common:
            return " ".join([word for word, _ in common]).title()
    
    return "Mixed Documents"

@app.get("/api/spatial", response_model=SpatialLayoutResponse)
async def get_spatial_layout(
    connection_threshold: float = 0.8
):
    """Get complete spatial layout with positions, clusters, and connections"""
    try:
        # Get all documents
        docs = qdrant_service.get_all_documents(limit=1000)
        
        if not docs:
            return SpatialLayoutResponse(
                documents=[],
                clusters=[],
                connections=[],
                spread=0.0
            )
        
        # Organize spatial layout
        embeddings = [doc["vector"] for doc in docs]
        layout = spatial_organizer.organize_spatial_layout(docs, embeddings)
        
        # Format documents
        documents = []
        for i, doc in enumerate(layout["documents"]):
            metadata = DocumentMetadata(**doc["metadata"])
            documents.append(Document(
                id=doc["id"],
                metadata=metadata,
                position=Position3D(**doc["position"]),
                cluster=doc["cluster"],
                embedding_generated=True
            ))
        
        # Format connections
        connections = []
        for conn in layout["connections"]:
            connections.append(Connection(
                source_id=docs[conn["source"]]["id"],
                target_id=docs[conn["target"]]["id"],
                strength=conn["strength"],
                type="similarity"
            ))
        
        # Calculate spread
        positions = [doc["position"] for doc in layout["documents"]]
        spread = spatial_organizer.calculate_document_spread(positions)
        
        # Format clusters with proper document_ids
        formatted_clusters = []
        for cluster in layout["clusters"]:
            document_ids = [docs[i]["id"] for i in cluster["document_indices"]]
            formatted_clusters.append({
                "cluster_id": cluster["cluster_id"],
                "center": cluster["center"],
                "size": cluster["size"],
                "document_ids": document_ids
            })
        
        return SpatialLayoutResponse(
            documents=documents,
            clusters=formatted_clusters,
            connections=connections,
            spread=spread
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def get_statistics():
    """Get comprehensive collection statistics including connections"""
    try:
        # Get collection info
        info = qdrant_service.get_collection_info()
        
        # Get all documents for detailed stats
        documents = qdrant_service.get_all_documents(limit=1000)
        
        # Calculate file type distribution
        file_types = {}
        total_size = 0
        
        for doc in documents:
            file_type = doc["metadata"].get("file_type", "unknown")
            file_types[file_type] = file_types.get(file_type, 0) + 1
            total_size += doc["metadata"].get("file_size", 0)
        
        # Get cluster count and info
        cluster_info = {}
        if documents:
            embeddings = [doc["vector"] for doc in documents]
            cluster_labels = spatial_organizer.cluster_documents(embeddings)
            unique_clusters = len(set(label for label in cluster_labels if label != -1))
            
            # Count documents per cluster
            for i, label in enumerate(cluster_labels):
                if label != -1:
                    if label not in cluster_info:
                        cluster_info[label] = {"count": 0, "size": 0}
                    cluster_info[label]["count"] += 1
                    cluster_info[label]["size"] += documents[i]["metadata"].get("file_size", 0)
        else:
            unique_clusters = 0
        
        # Calculate connection statistics
        connection_stats = {}
        if documents and len(documents) > 1:
            # Get connections with lower threshold to see more
            connections = spatial_organizer._calculate_connections(embeddings, threshold=0.5)
            total_connections = len(connections)
            
            # Count connections per document
            connection_counts = {}
            for conn in connections:
                source = conn["source"]
                target = conn["target"]
                connection_counts[source] = connection_counts.get(source, 0) + 1
                connection_counts[target] = connection_counts.get(target, 0) + 1
            
            # Find most connected documents
            if connection_counts:
                sorted_connections = sorted(connection_counts.items(), key=lambda x: x[1], reverse=True)
                most_connected = []
                for doc_idx, count in sorted_connections[:10]:
                    if doc_idx < len(documents):
                        doc = documents[doc_idx]
                        most_connected.append({
                            "title": doc["metadata"].get("title", doc["metadata"].get("filename", "Unknown")),
                            "connections": count,
                            "file_type": doc["metadata"].get("file_type", "unknown")
                        })
                
                # Calculate statistics
                avg_connections = sum(connection_counts.values()) / len(connection_counts) if connection_counts else 0
                isolated_docs = len(documents) - len(connection_counts)
                
                connection_stats = {
                    "total_connections": total_connections,
                    "average_connections_per_doc": round(avg_connections, 2),
                    "most_connected_documents": most_connected,
                    "isolated_documents": isolated_docs,
                    "connection_density": round(total_connections / (len(documents) * (len(documents) - 1) / 2), 4) if len(documents) > 1 else 0
                }
            else:
                connection_stats = {
                    "total_connections": 0,
                    "average_connections_per_doc": 0,
                    "most_connected_documents": [],
                    "isolated_documents": len(documents),
                    "connection_density": 0
                }
        else:
            connection_stats = {
                "total_connections": 0,
                "average_connections_per_doc": 0,
                "most_connected_documents": [],
                "isolated_documents": len(documents),
                "connection_density": 0
            }
        
        return {
            "total_documents": info["points_count"],
            "total_clusters": unique_clusters,
            "file_types": file_types,
            "total_size": total_size,
            "average_document_size": round(total_size / len(documents), 2) if documents else 0,
            "cluster_info": cluster_info,
            "connection_stats": connection_stats,
            "last_updated": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/documents/{document_id}", response_model=DeleteResponse)
async def delete_document(document_id: str):
    """Delete a document from the collection"""
    try:
        # Check if document exists
        doc = qdrant_service.get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete from Qdrant
        success = qdrant_service.delete_document(document_id)
        
        if success:
            return DeleteResponse(
                success=True,
                message=f"Document {document_id} deleted successfully",
                document_id=document_id
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to delete document")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/{document_id}/connections")
async def get_document_connections(
    document_id: str,
    threshold: float = 0.7,
    max_connections: int = 10
):
    """Get strongly connected documents for a specific document"""
    try:
        connections = qdrant_service.find_connections(
            document_id=document_id,
            connection_threshold=threshold,
            max_connections=max_connections
        )
        
        return {
            "document_id": document_id,
            "connections": connections,
            "count": len(connections)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/clear-collection")
async def clear_collection():
    """Clear all documents from the collection - USE WITH CAUTION"""
    try:
        # Delete and recreate the collection
        qdrant_service.client.delete_collection(qdrant_service.collection_name)
        qdrant_service._ensure_collection()
        
        return {
            "success": True,
            "message": "Collection cleared successfully. Please re-upload your documents."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reprocess-all")
async def reprocess_all_documents():
    """Reprocess all documents to extract content previews for better clustering"""
    try:
        import os
        from pathlib import Path
        
        # Get all documents from Qdrant
        documents = qdrant_service.get_all_documents(limit=1000)
        
        if not documents:
            return {
                "success": False,
                "message": "No documents found to reprocess",
                "processed": 0
            }
        
        processed_count = 0
        failed_count = 0
        updated_docs = []
        
        for doc in documents:
            try:
                metadata = doc.get("metadata", {})
                file_path = metadata.get("file_path")
                
                # Skip if already has content_preview
                if metadata.get("content_preview"):
                    continue
                
                # Check if file exists
                if not file_path or not os.path.exists(file_path):
                    print(f"File not found for document {doc['id']}: {file_path}")
                    failed_count += 1
                    continue
                
                # Read and reprocess the file
                with open(file_path, "rb") as f:
                    content = f.read()
                
                # Process file to extract content
                processed = file_processor.process_file(
                    content=content,
                    filename=metadata.get("filename", ""),
                    content_type=metadata.get("content_type")
                )
                
                # Extract content preview
                content_text = processed["content"]
                content_preview = content_text[:2000] if len(content_text) > 2000 else content_text
                
                # Update metadata with content preview
                metadata["content_preview"] = content_preview
                
                # Update document in Qdrant
                success = qdrant_service.update_document(
                    document_id=doc["id"],
                    metadata=metadata
                )
                
                if success:
                    processed_count += 1
                    updated_docs.append({
                        "id": doc["id"],
                        "filename": metadata.get("filename", "Unknown")
                    })
                else:
                    failed_count += 1
                    
            except Exception as e:
                print(f"Error processing document {doc['id']}: {str(e)}")
                failed_count += 1
                continue
        
        # Now recalculate clusters with the new content
        all_docs = qdrant_service.get_all_documents(limit=1000)
        embeddings = [doc["vector"] for doc in all_docs]
        cluster_labels = spatial_organizer.cluster_documents(embeddings)
        
        return {
            "success": True,
            "message": f"Reprocessed {processed_count} documents successfully",
            "processed": processed_count,
            "failed": failed_count,
            "updated_documents": updated_docs,
            "total_documents": len(documents),
            "clusters_recalculated": True
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{doc_id}/deepdive")
async def deep_dive_analysis(doc_id: str):
    """
    Perform deep analysis on a document and its relationships
    """
    try:
        # Get the document from Qdrant
        doc_points = qdrant_service.client.retrieve(
            collection_name=qdrant_service.collection_name,
            ids=[doc_id],
            with_vectors=True,
            with_payload=True
        )
        
        if not doc_points:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = doc_points[0]
        doc_vector = doc.vector
        doc_metadata = doc.payload
        
        # Get similar documents
        similar_docs = qdrant_service.search(
            query_vector=doc_vector,
            limit=50,
            score_threshold=0.5
        )
        
        # Extract content for analysis
        content = doc_metadata.get('content_preview', '')
        
        # Perform analyses
        analysis = {
            'document_id': doc_id,
            'title': doc_metadata.get('title', 'Untitled'),
            'type': doc_metadata.get('file_type', 'unknown'),
            
            # Related documents grouped by similarity
            'related_documents': [
                {
                    'id': str(d['id']),
                    'title': d['metadata'].get('title', 'Untitled'),
                    'similarity': d['score'],
                    'type': d['metadata'].get('file_type', 'unknown')
                }
                for d in similar_docs if str(d['id']) != doc_id
            ][:20],
            
            # Key concepts extraction
            'key_concepts': extract_key_concepts(content),
            
            # Information density calculation
            'information_density': calculate_information_density(content),
            
            # Uniqueness score
            'uniqueness': calculate_uniqueness_score(similar_docs),
            
            # Average connection strength
            'avg_connection_strength': sum(d['score'] for d in similar_docs) / len(similar_docs) if similar_docs else 0,
            
            # Generate insights
            'insights': generate_insights(doc_metadata, similar_docs),
            
            # Extract entities
            'entities': extract_entities(content),
            
            # Top connections with details
            'top_connections': [
                {
                    'id': str(d['id']),
                    'title': d['metadata'].get('title', 'Untitled'),
                    'similarity': d['score'],
                    'preview': d['metadata'].get('content_preview', '')[:100],
                    'file_url': d['metadata'].get('file_url', ''),
                    'file_type': d['metadata'].get('file_type', 'unknown')
                }
                for d in similar_docs[:5] if str(d['id']) != doc_id
            ],
            
            # AI recommendation
            'recommendation': generate_recommendation(doc_metadata, similar_docs)
        }
        
        return analysis
        
    except Exception as e:
        print(f"Deep dive analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def extract_key_concepts(content: str, max_concepts: int = 10):
    """Extract key concepts from document content"""
    import re
    from collections import Counter
    
    if not content:
        return []
    
    # Simple keyword extraction
    words = re.findall(r'\b[a-z]+\b', content.lower())
    
    # Filter out common words
    stopwords = {'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'but', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once'}
    
    filtered_words = [w for w in words if w not in stopwords and len(w) > 3]
    
    # Count word frequency
    word_counts = Counter(filtered_words)
    
    # Get top concepts with importance scores
    concepts = []
    top_words = word_counts.most_common(max_concepts)
    max_count = top_words[0][1] if top_words else 1
    
    for word, count in top_words:
        concepts.append({
            'text': word,
            'importance': count / max_count,
            'count': count
        })
    
    return concepts

def calculate_information_density(content: str) -> float:
    """Calculate information density of document content"""
    if not content:
        return 0.0
    
    # Simple metrics for information density
    word_count = len(content.split())
    unique_words = len(set(content.lower().split()))
    
    if word_count == 0:
        return 0.0
    
    # Lexical diversity
    lexical_diversity = unique_words / word_count
    
    # Normalize to 0-1 range
    density = min(1.0, lexical_diversity * 2)
    
    return density

def calculate_uniqueness_score(similar_docs: list) -> float:
    """Calculate how unique this document is compared to others"""
    if not similar_docs:
        return 1.0
    
    # Average similarity to other documents
    avg_similarity = sum(d['score'] for d in similar_docs) / len(similar_docs)
    
    # Uniqueness is inverse of average similarity
    uniqueness = 1.0 - avg_similarity
    
    return max(0.0, min(1.0, uniqueness))

def extract_entities(content: str) -> list:
    """Extract named entities from content"""
    import re
    
    entities = []
    
    if not content:
        return entities
    
    # Simple pattern matching for entities
    # Capitalized words (potential names/places)
    capitalized = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', content)
    
    # Deduplicate and categorize
    seen = set()
    for entity in capitalized[:20]:  # Limit to top 20
        if entity not in seen and len(entity) > 2:
            seen.add(entity)
            # Simple categorization
            entity_type = 'concept'
            if any(word in entity.lower() for word in ['university', 'college', 'company', 'corporation', 'inc', 'ltd']):
                entity_type = 'organization'
            elif any(word in entity.lower() for word in ['street', 'road', 'city', 'country']):
                entity_type = 'place'
            
            entities.append({
                'name': entity,
                'type': entity_type
            })
    
    return entities[:10]  # Return top 10

def generate_insights(doc_metadata: dict, similar_docs: list) -> list:
    """Generate intelligent insights about the document"""
    insights = []
    
    # Insight 1: Document centrality
    if len(similar_docs) > 10:
        insights.append(f"This document is highly connected with {len(similar_docs)} other documents in your knowledge base")
    
    # Insight 2: File type analysis
    if doc_metadata.get('file_type') == 'pdf':
        insights.append("PDF document likely contains detailed information or formal content")
    elif doc_metadata.get('file_type') == 'image':
        insights.append("Visual content that may complement textual documents")
    
    # Insight 3: Similarity clustering
    high_similarity = [d for d in similar_docs if d['score'] > 0.85]
    if high_similarity:
        insights.append(f"Found {len(high_similarity)} highly similar documents (>85% match)")
    
    # Insight 4: Content size
    if doc_metadata.get('file_size', 0) > 1000000:
        insights.append("Large file size suggests comprehensive content")
    
    return insights[:5]

def generate_recommendation(doc_metadata: dict, similar_docs: list) -> str:
    """Generate AI recommendation based on analysis"""
    recommendations = []
    
    # Check for knowledge gaps
    if len(similar_docs) < 5:
        recommendations.append("This document appears isolated. Consider adding related materials to build stronger knowledge connections.")
    elif len(similar_docs) > 30:
        recommendations.append("This document is a knowledge hub. Consider using it as a starting point for exploration.")
    
    # Check similarity distribution
    high_sim = len([d for d in similar_docs if d['score'] > 0.8])
    
    if high_sim > len(similar_docs) / 2:
        recommendations.append("Strong topical cluster identified. These documents form a cohesive knowledge area.")
    
    return " ".join(recommendations[:2]) if recommendations else "Document is well-integrated into your knowledge base."

@app.post("/api/documents/{doc_id}/summarize")
async def summarize_document(doc_id: str):
    """Generate summary of document"""
    try:
        # Get the document
        doc_points = qdrant_service.client.retrieve(
            collection_name=qdrant_service.collection_name,
            ids=[doc_id],
            with_payload=True
        )
        
        if not doc_points:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc_metadata = doc_points[0].payload
        content = doc_metadata.get('content_preview', '')[:3000]
        
        # Simple summary generation
        sentences = content.split('.')[:5]
        summary = '. '.join(sentences) + '.' if sentences else 'No content available for summary.'
        
        return {
            'document_id': doc_id,
            'summary': summary,
            'word_count': len(content.split()),
            'generated_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"Summarization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)