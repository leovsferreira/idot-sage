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

def filter_data_by_time(df, start_time=None, end_time=None):
    """Apply client-side time filtering to the dataframe after querying"""
    if start_time is None and end_time is None:
        return df
    
    if not pd.api.types.is_datetime64_any_dtype(df['timestamp']):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    df_times = df['timestamp'].dt.time
    
    if start_time and end_time:
        start_time_obj = datetime.strptime(start_time, '%H:%M').time()
        end_time_obj = datetime.strptime(end_time, '%H:%M').time()
        
        if start_time_obj <= end_time_obj:
            mask = (df_times >= start_time_obj) & (df_times <= end_time_obj)
        else:
            mask = (df_times >= start_time_obj) | (df_times <= end_time_obj)
    elif start_time:
        start_time_obj = datetime.strptime(start_time, '%H:%M').time()
        mask = df_times >= start_time_obj
    elif end_time:
        end_time_obj = datetime.strptime(end_time, '%H:%M').time()
        mask = df_times <= end_time_obj
    
    return df[mask]

def extract_timestamp_from_url(url):
    """Extract timestamp from image URL"""
    import re
    match = re.search(r'/(\d+)-snapshot\.jpg$', url)
    if match:
        return int(match.group(1))
    return None

def create_image_records(upload_df, detection_df, selected_models):
    """Create merged image records with detection data"""
    images = []
    
    detection_lookup = {}
    
    for _, det_row in detection_df.iterrows():
        try:
            detection_data = json.loads(det_row['value'])
            image_timestamp_ns = detection_data.get('image_timestamp_ns')
            if image_timestamp_ns:
                filtered_models = {
                    model: results for model, results in detection_data.get('models_results', {}).items()
                    if model in selected_models
                }
                if filtered_models:
                    detection_lookup[image_timestamp_ns] = {
                        'models_results': filtered_models,
                        'detection_timestamp': det_row['timestamp']
                    }
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing detection data: {e}")
            continue
    
    print(f"Built detection lookup with {len(detection_lookup)} entries")
    
    for _, upload_row in upload_df.iterrows():
        url_timestamp = extract_timestamp_from_url(upload_row['value'])
        
        if url_timestamp and url_timestamp in detection_lookup:
            detection_info = detection_lookup[url_timestamp]
            
            image_record = {
                'url': upload_row['value'],
                'timestamp': upload_row['timestamp'].isoformat() if hasattr(upload_row['timestamp'], 'isoformat') else str(upload_row['timestamp']),
                'node': upload_row['meta.vsn'],
                'filename': upload_row.get('meta.filename', 'snapshot.jpg'),
                'image_timestamp_ns': url_timestamp,
                'models_results': detection_info['models_results'],
                'meta': {
                    'host': upload_row['meta.host'],
                    'job': upload_row['meta.job'],
                    'plugin': upload_row['meta.plugin'],
                    'task': upload_row['meta.task'],
                    'zone': upload_row['meta.zone']
                }
            }
            images.append(image_record)
        else:
            image_record = {
                'url': upload_row['value'],
                'timestamp': upload_row['timestamp'].isoformat() if hasattr(upload_row['timestamp'], 'isoformat') else str(upload_row['timestamp']),
                'node': upload_row['meta.vsn'],
                'filename': upload_row.get('meta.filename', 'snapshot.jpg'),
                'image_timestamp_ns': url_timestamp or 0,
                'models_results': {},
                'meta': {
                    'host': upload_row['meta.host'],
                    'job': upload_row['meta.job'],
                    'plugin': upload_row['meta.plugin'],
                    'task': upload_row['meta.task'],
                    'zone': upload_row['meta.zone']
                }
            }
            images.append(image_record)
    
    return images

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
        
        start = f"{start_date}T00:00:00Z"
        end = f"{end_date}T23:59:59Z"
        
        filter_params = {
            "plugin": ".*multithread-sage-idot:1.1.0",
            "vsn": node
        }
        
        print(f"Querying with: start={start}, end={end}, filter={filter_params}")
        
        df = sage_data_client.query(
            start=start,
            end=end,
            filter=filter_params
        )
        
        if not df.empty:
            print(f"Raw data received: {len(df)} records")
            
            filtered_df = filter_data_by_time(df, start_time, end_time)
            print(f"After time filtering: {len(filtered_df)} records")
            
            detection_df = filtered_df[filtered_df['name'] == 'object.detections.all'].copy()
            upload_df = filtered_df[filtered_df['name'] == 'upload'].copy()
            
            print(f"Detection records: {len(detection_df)}")
            print(f"Upload records: {len(upload_df)}")
            
            if len(filtered_df) > 0:
                min_date = filtered_df['timestamp'].min()
                max_date = filtered_df['timestamp'].max()
                print(f"Filtered data date range: {min_date} to {max_date}")
            
            images = create_image_records(upload_df, detection_df, models)
            
            images.sort(key=lambda x: x['timestamp'])
            
            return jsonify({
                "success": True,
                "images": images,
                "total": len(images),
                "query": {
                    "start": start,
                    "end": end,
                    "start_time": start_time,
                    "end_time": end_time,
                    "node": node,
                    "models": models
                },
                "stats": {
                    "raw_records": len(df),
                    "after_time_filter": len(filtered_df),
                    "detection_records": len(detection_df),
                    "upload_records": len(upload_df),
                    "final_images": len(images)
                }
            })
        else:
            print("No data found, returning empty results")
            return jsonify({
                "success": True,
                "images": [],
                "total": 0,
                "message": "No data found for the specified criteria",
                "query": {
                    "start": start,
                    "end": end,
                    "start_time": start_time,
                    "end_time": end_time,
                    "node": node,
                    "models": models
                }
            })
            
    except Exception as e:
        print(f"Query error: {str(e)}")
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