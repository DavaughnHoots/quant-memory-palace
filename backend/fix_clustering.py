#!/usr/bin/env python3
"""
Fix document clustering based on actual vector similarities
"""

import numpy as np
from sklearn.cluster import KMeans, AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
import json

def fix_clustering(collection_name="memory_palace", n_clusters=10):
    """Re-cluster documents based on their actual vector embeddings"""
    
    # Connect to Qdrant
    client = QdrantClient(host="localhost", port=6333)
    
    print(f"Fetching all documents from collection '{collection_name}'...")
    
    # Get all documents with vectors
    scroll_result = client.scroll(
        collection_name=collection_name,
        limit=1000,
        with_vectors=True,
        with_payload=True
    )
    
    points = scroll_result[0]
    print(f"Found {len(points)} documents")
    
    if len(points) == 0:
        print("No documents found!")
        return
    
    # Extract vectors and IDs
    vectors = np.array([point.vector for point in points])
    doc_ids = [point.id for point in points]
    
    print(f"Vector shape: {vectors.shape}")
    print(f"Performing clustering with {n_clusters} clusters...")
    
    # Method 1: KMeans clustering (faster)
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(vectors)
    
    # Method 2: Agglomerative clustering (better quality)
    # similarities = cosine_similarity(vectors)
    # agglo = AgglomerativeClustering(
    #     n_clusters=n_clusters,
    #     metric='precomputed',
    #     linkage='average'
    # )
    # cluster_labels = agglo.fit_predict(1 - similarities)  # Convert similarity to distance
    
    print("Clustering complete!")
    
    # Count documents per cluster
    cluster_counts = {}
    for label in cluster_labels:
        cluster_counts[label] = cluster_counts.get(label, 0) + 1
    
    print("\nCluster distribution:")
    for cluster_id, count in sorted(cluster_counts.items()):
        print(f"  Cluster {cluster_id}: {count} documents")
    
    # Update documents with new cluster assignments
    print("\nUpdating document payloads with new cluster assignments...")
    
    updated = 0
    for i, point in enumerate(points):
        new_cluster = int(cluster_labels[i])
        old_cluster = point.payload.get('cluster', -1)
        
        if old_cluster != new_cluster:
            # Update the payload with new cluster
            point.payload['cluster'] = new_cluster
            
            # Update in Qdrant
            client.set_payload(
                collection_name=collection_name,
                payload=point.payload,
                points=[point.id]
            )
            
            updated += 1
            if updated % 10 == 0:
                print(f"  Updated {updated} documents...")
    
    print(f"\nRe-clustering complete! Updated {updated} documents.")
    
    # Verify the update
    print("\nVerifying new cluster assignments...")
    verify_result = client.scroll(
        collection_name=collection_name,
        limit=10,
        with_payload=["cluster", "title", "filename"]
    )
    
    print("Sample of updated documents:")
    for point in verify_result[0][:5]:
        title = point.payload.get('title') or point.payload.get('filename', 'Unknown')
        cluster = point.payload.get('cluster', -1)
        print(f"  {title[:50]}... -> Cluster {cluster}")
    
    return cluster_labels

if __name__ == "__main__":
    import sys
    
    n_clusters = 10
    if len(sys.argv) > 1:
        n_clusters = int(sys.argv[1])
    
    print(f"Re-clustering documents into {n_clusters} clusters based on vector similarities...")
    fix_clustering(n_clusters=n_clusters)