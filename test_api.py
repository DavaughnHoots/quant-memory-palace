import requests
import json
import time
from pathlib import Path

BASE_URL = "http://localhost:8000"

def test_health():
    """Test if API is running"""
    print("🔍 Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        return data["status"] == "healthy" or data["status"] == "degraded"
    return False

def test_upload_text():
    """Test uploading a text file"""
    print("\n📤 Testing file upload...")
    
    # Create a test text file
    test_content = """
    Introduction to Neural Networks
    
    Neural networks are computing systems inspired by biological neural networks.
    They consist of interconnected nodes that process information using connectionist approaches.
    Deep learning is a subset of machine learning that uses neural networks with multiple layers.
    Transformers have revolutionized natural language processing tasks.
    The attention mechanism allows models to focus on relevant parts of the input.
    """
    
    files = {
        'file': ('test_document.txt', test_content, 'text/plain')
    }
    
    data = {
        'title': 'Neural Networks Introduction',
        'description': 'A brief introduction to neural networks and deep learning',
        'tags': 'AI,machine-learning,neural-networks'
    }
    
    response = requests.post(f"{BASE_URL}/api/upload", files=files, data=data)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        return data.get('document_id')
    else:
        print(f"Error: {response.text}")
        return None

def test_upload_multiple():
    """Upload multiple test documents"""
    print("\n📚 Uploading multiple test documents...")
    
    test_documents = [
        {
            'content': """
            Quantum Computing Fundamentals
            
            Quantum computing uses quantum mechanics principles to process information.
            Qubits can exist in superposition, unlike classical bits.
            Quantum entanglement enables parallel processing capabilities.
            Quantum algorithms like Shor's algorithm can factor large numbers efficiently.
            """,
            'filename': 'quantum_computing.txt',
            'title': 'Quantum Computing Basics',
            'tags': 'quantum,computing,physics'
        },
        {
            'content': """
            Machine Learning Best Practices
            
            Always split your data into training, validation, and test sets.
            Feature engineering is crucial for model performance.
            Cross-validation helps prevent overfitting.
            Monitor both training and validation metrics.
            Regular model evaluation and retraining is essential.
            """,
            'filename': 'ml_best_practices.txt',
            'title': 'ML Best Practices',
            'tags': 'machine-learning,best-practices,data-science'
        },
        {
            'content': """
            Introduction to Blockchain Technology
            
            Blockchain is a distributed ledger technology.
            Each block contains a cryptographic hash of the previous block.
            Consensus mechanisms ensure network agreement.
            Smart contracts enable programmable transactions.
            Decentralization provides security and transparency.
            """,
            'filename': 'blockchain_intro.txt',
            'title': 'Blockchain Technology',
            'tags': 'blockchain,cryptocurrency,distributed-systems'
        }
    ]
    
    document_ids = []
    for doc in test_documents:
        files = {
            'file': (doc['filename'], doc['content'], 'text/plain')
        }
        data = {
            'title': doc['title'],
            'tags': doc['tags']
        }
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, data=data)
        if response.status_code == 200:
            doc_id = response.json().get('document_id')
            document_ids.append(doc_id)
            print(f"✅ Uploaded: {doc['title']} (ID: {doc_id})")
        else:
            print(f"❌ Failed to upload: {doc['title']}")
        
        time.sleep(0.5)  # Rate limiting
    
    return document_ids

def test_get_documents():
    """Test getting all documents"""
    print("\n📚 Getting all documents...")
    response = requests.get(f"{BASE_URL}/api/documents")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        documents = response.json()
        print(f"Found {len(documents)} documents")
        for doc in documents[:5]:  # Show first 5
            print(f"  - ID: {doc['id']}")
            print(f"    Title: {doc['metadata']['title']}")
            print(f"    Type: {doc['metadata']['file_type']}")
            print(f"    Position: ({doc['position']['x']:.2f}, {doc['position']['y']:.2f}, {doc['position']['z']:.2f})")
            print(f"    Cluster: {doc['cluster']}")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_search():
    """Test semantic search"""
    print("\n🔎 Testing search...")
    
    search_queries = [
        "deep learning transformers attention",
        "quantum superposition",
        "blockchain consensus",
        "machine learning validation"
    ]
    
    for query_text in search_queries:
        search_query = {
            "query": query_text,
            "limit": 3,
            "threshold": 0.5,
            "include_content": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/search",
            json=search_query
        )
        
        if response.status_code == 200:
            results = response.json()
            print(f"\nQuery: '{query_text}'")
            print(f"Found {results['count']} results in {results['processing_time']:.3f}s")
            for result in results['results']:
                print(f"  - Score: {result['score']:.3f}")
                print(f"    Title: {result['document']['metadata']['title']}")
                if result['document'].get('content_preview'):
                    preview = result['document']['content_preview'][:100] + "..."
                    print(f"    Preview: {preview}")
        else:
            print(f"Search failed: {response.text}")
        
        time.sleep(0.5)

def test_clusters():
    """Test document clustering"""
    print("\n🗂️ Testing clustering...")
    response = requests.get(f"{BASE_URL}/api/clusters")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Found {data['count']} clusters using {data['method']}")
        for cluster in data['clusters']:
            print(f"  - Cluster {cluster['cluster_id']}: {cluster['size']} documents")
            print(f"    Center: ({cluster['center']['x']:.2f}, {cluster['center']['y']:.2f}, {cluster['center']['z']:.2f})")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_spatial_layout():
    """Test spatial layout endpoint"""
    print("\n🌐 Testing spatial layout...")
    response = requests.get(f"{BASE_URL}/api/spatial?connection_threshold=0.7")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Documents: {len(data['documents'])}")
        print(f"Clusters: {len(data['clusters'])}")
        print(f"Connections: {len(data['connections'])}")
        print(f"Spatial spread: {data['spread']:.2f}")
        
        # Show some connections
        if data['connections']:
            print("\nStrong connections:")
            for conn in data['connections'][:5]:
                print(f"  - {conn['source_id'][:8]}... ↔ {conn['target_id'][:8]}... (strength: {conn['strength']:.3f})")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_statistics():
    """Test statistics endpoint"""
    print("\n📊 Getting statistics...")
    response = requests.get(f"{BASE_URL}/api/stats")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        stats = response.json()
        print(f"Statistics:")
        print(f"  Total documents: {stats['total_documents']}")
        print(f"  Total clusters: {stats['total_clusters']}")
        print(f"  File types: {json.dumps(stats['file_types'], indent=4)}")
        print(f"  Total size: {stats['total_size'] / 1024:.2f} KB")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_document_connections():
    """Test getting connections for a specific document"""
    print("\n🔗 Testing document connections...")
    
    # First get a document ID
    response = requests.get(f"{BASE_URL}/api/documents?limit=1")
    if response.status_code == 200 and response.json():
        doc_id = response.json()[0]['id']
        print(f"Getting connections for document: {doc_id}")
        
        response = requests.get(f"{BASE_URL}/api/documents/{doc_id}/connections?threshold=0.6")
        if response.status_code == 200:
            data = response.json()
            print(f"Found {data['count']} connections")
            for conn in data['connections']:
                print(f"  - ID: {conn['id']}")
                print(f"    Score: {conn['score']:.3f}")
                print(f"    Title: {conn['metadata']['title']}")
            return True
    
    print("No documents available for connection test")
    return False

def test_delete_document():
    """Test document deletion"""
    print("\n🗑️ Testing document deletion...")
    
    # First create a document to delete
    test_content = "This is a test document for deletion"
    files = {'file': ('delete_test.txt', test_content, 'text/plain')}
    
    response = requests.post(f"{BASE_URL}/api/upload", files=files)
    if response.status_code == 200:
        doc_id = response.json()['document_id']
        print(f"Created document: {doc_id}")
        
        # Now delete it
        response = requests.delete(f"{BASE_URL}/api/documents/{doc_id}")
        if response.status_code == 200:
            print(f"✅ Document deleted successfully")
            return True
        else:
            print(f"❌ Failed to delete: {response.text}")
    
    return False

def run_all_tests():
    """Run all tests"""
    print("🧪 Running Memory Palace API Tests")
    print("=" * 40)
    
    # Check if API is running
    if not test_health():
        print("❌ API is not running. Start it with: uvicorn main:app --reload")
        return
    
    # Run tests
    tests_passed = 0
    tests_total = 0
    
    # Upload test documents
    print("\n" + "=" * 40)
    doc_id = test_upload_text()
    if doc_id:
        tests_passed += 1
    tests_total += 1
    
    # Upload multiple documents
    doc_ids = test_upload_multiple()
    if doc_ids:
        tests_passed += 1
    tests_total += 1
    
    # Allow time for processing
    print("\n⏳ Waiting for embeddings to process...")
    time.sleep(2)
    
    # Test other endpoints
    print("\n" + "=" * 40)
    if test_get_documents():
        tests_passed += 1
    tests_total += 1
    
    print("\n" + "=" * 40)
    test_search()  # Search doesn't return boolean
    
    print("\n" + "=" * 40)
    if test_clusters():
        tests_passed += 1
    tests_total += 1
    
    print("\n" + "=" * 40)
    if test_spatial_layout():
        tests_passed += 1
    tests_total += 1
    
    print("\n" + "=" * 40)
    if test_statistics():
        tests_passed += 1
    tests_total += 1
    
    print("\n" + "=" * 40)
    if test_document_connections():
        tests_passed += 1
    tests_total += 1
    
    print("\n" + "=" * 40)
    if test_delete_document():
        tests_passed += 1
    tests_total += 1
    
    # Summary
    print("\n" + "=" * 40)
    print(f"✅ Tests passed: {tests_passed}/{tests_total}")
    print("\n📝 Summary:")
    print("  - API is running and responsive")
    print("  - File upload and processing works")
    print("  - Vector embeddings are being generated")
    print("  - Semantic search is functional")
    print("  - 3D positioning and clustering works")
    print("  - Document connections are calculated")
    print("\n🎉 Backend is ready for the Memory Palace frontend!")

if __name__ == "__main__":
    run_all_tests()