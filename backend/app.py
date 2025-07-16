from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
import sage_data_client
import pandas as pd
import requests
import json
import random

load_dotenv()

app = Flask(__name__)
CORS(app)

SAGE_USERNAME = os.getenv('SAGE_USERNAME')
SAGE_ACCESS_TOKEN = os.getenv('SAGE_ACCESS_TOKEN')

# Simulate model results for demo
def simulate_model_results():
    classes = ['car', 'person', 'traffic light', 'bus', 'truck', 'bicycle']
    models = ['YOLOv5n', 'YOLOv8n', 'YOLOv10n']
    
    results = {}
    for model in models:
        if random.random() > 0.3:
            num_detections = random.randint(1, 5)
            detections = []
            counts = {}
            
            for _ in range(num_detections):
                cls = random.choice(classes)
                confidence = random.uniform(0.3, 0.95)
                
                x1 = random.uniform(100, 1500)
                y1 = random.uniform(100, 800)
                width = random.uniform(50, 200)
                height = random.uniform(50, 200)
                
                detections.append({
                    "class": cls,
                    "confidence": confidence,
                    "bbox": [x1, y1, x1 + width, y1 + height]
                })
                
                counts[cls] = counts.get(cls, 0) + 1
            
            results[model] = {
                "model": model,
                "detections": detections,
                "counts": counts,
                "total_objects": num_detections,
                "inference_time_seconds": random.uniform(1.5, 2.5)
            }
    
    return results

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Backend is running"})

@app.route('/api/query', methods=['POST'])
def handle_query():
    try:
        data = request.get_json()
        
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        start_time = data.get('startTime')
        end_time = data.get('endTime') 
        node = data.get('node')
        models = data.get('models', ['YOLOv8n'])
        
        if start_time:
            start = f"{start_date}T{start_time}:00Z"
        else:
            start = f"{start_date}T00:00:00Z"
            
        if end_time:
            end = f"{end_date}T{end_time}:59Z"
        else:
            end = f"{end_date}T23:59:59Z"
        
        filter_params = {
            "plugin": ".*multithread-sage-idot:1.0.0",
            "vsn": node
        }
        
        df = sage_data_client.query(
            start=start,
            end=end,
            filter=filter_params
        )
        
        if not df.empty:
            upload_df = df[df['name'] == 'upload'].copy()
            
            images = []
            for idx, row in upload_df.iterrows():
                image_data = {
                    'url': row['value'],
                    'timestamp': row['timestamp'].isoformat() if hasattr(row['timestamp'], 'isoformat') else str(row['timestamp']),
                    'node': row['meta.vsn'],
                    'filename': row.get('meta.filename', 'snapshot.jpg'),
                    'image_timestamp_ns': int(row['timestamp'].timestamp() * 1e9) if hasattr(row['timestamp'], 'timestamp') else 0,
                    'models_results': simulate_model_results()
                }
                images.append(image_data)
            
            return jsonify({
                "success": True,
                "images": images,
                "total": len(images),
                "query": {
                    "start": start,
                    "end": end,
                    "node": node,
                    "models": models
                }
            })
        else:
            demo_images = []
            current_time = datetime.fromisoformat(start_date)
            end_time = datetime.fromisoformat(end_date)
            
            while current_time <= end_time:
                num_images = random.randint(10, 20)
                for _ in range(num_images):
                    hour = random.randint(0, 23)
                    minute = random.randint(0, 59)
                    timestamp = current_time.replace(hour=hour, minute=minute)
                    
                    demo_images.append({
                        'url': f'https://example.com/image_{timestamp.timestamp()}.jpg',
                        'timestamp': timestamp.isoformat(),
                        'node': node,
                        'filename': f'snapshot_{timestamp.timestamp()}.jpg',
                        'image_timestamp_ns': int(timestamp.timestamp() * 1e9),
                        'models_results': simulate_model_results()
                    })
                
                current_time = current_time.replace(hour=0, minute=0) + pd.Timedelta(days=1)
            
            return jsonify({
                "success": True,
                "images": demo_images,
                "total": len(demo_images),
                "query": {
                    "start": start,
                    "end": end,
                    "node": node,
                    "models": models
                }
            })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/llm-query', methods=['POST'])
def handle_llm_query():
    data = request.get_json()
    return jsonify({"message": "LLM query received", "data": data})

@app.route('/api/proxy-image', methods=['GET'])
def proxy_image():
    """Proxy images from the sage storage to avoid CORS issues"""
    image_url = request.args.get('url')
    
    if not image_url:
        return jsonify({"error": "No URL provided"}), 400
    
    try:
        response = requests.get(
            image_url, 
            auth=(SAGE_USERNAME, SAGE_ACCESS_TOKEN),
            stream=True
        )
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', 'image/jpeg')
        
        return Response(
            response.iter_content(chunk_size=1024),
            content_type=content_type,
            headers={
                'Cache-Control': 'public, max-age=3600'
            }
        )
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            return jsonify({"error": "Authentication failed. Please check your Sage credentials."}), 401
        return jsonify({"error": f"HTTP Error: {e}"}), e.response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)