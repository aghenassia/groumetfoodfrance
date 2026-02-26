#!/usr/bin/env python3
"""
Ringover CRM - Application locale pour gérer vos appels
"""

from flask import Flask, render_template, jsonify, request, Response
import requests
import sqlite3
from datetime import datetime
import os

app = Flask(__name__)

# Configuration
RINGOVER_API_KEY = "a369401bce8420242735bf3bf96b3156f950fc68"
RINGOVER_BASE_URL = "https://public-api.ringover.com/v2"
DATABASE = "crm_database.db"

def get_db():
    """Connexion à la base de données SQLite"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialise la base de données"""
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cdr_id INTEGER UNIQUE,
            call_id TEXT,
            direction TEXT,
            is_answered BOOLEAN,
            last_state TEXT,
            start_time TEXT,
            end_time TEXT,
            total_duration INTEGER,
            incall_duration INTEGER,
            from_number TEXT,
            to_number TEXT,
            contact_number TEXT,
            hangup_by TEXT,
            voicemail_url TEXT,
            record_url TEXT,
            user_name TEXT,
            user_email TEXT,
            contact_name TEXT,
            notes TEXT,
            tags TEXT,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER UNIQUE,
            firstname TEXT,
            lastname TEXT,
            company TEXT,
            phone_number TEXT,
            phone_type TEXT,
            email TEXT,
            creation_date TEXT,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS crm_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_cdr_id INTEGER,
            contact_number TEXT,
            note TEXT,
            created_at TEXT,
            FOREIGN KEY (call_cdr_id) REFERENCES calls(cdr_id)
        );
    ''')
    conn.commit()
    conn.close()

def ringover_request(endpoint, params=None):
    """Effectue une requête à l'API Ringover"""
    headers = {"Authorization": RINGOVER_API_KEY}
    url = f"{RINGOVER_BASE_URL}/{endpoint}"
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        return response.json()
    return None

@app.route('/')
def index():
    """Page principale du CRM"""
    return render_template('index.html')

@app.route('/api/sync')
def sync_data():
    """Synchronise les données depuis Ringover"""
    conn = get_db()
    cursor = conn.cursor()

    # Récupérer tous les appels (pagination)
    all_calls = []
    offset = 0
    limit = 100

    while True:
        data = ringover_request('calls', {'limit_count': limit, 'limit_offset': offset})
        if not data or not data.get('call_list'):
            break

        all_calls.extend(data['call_list'])

        if len(data['call_list']) < limit:
            break
        offset += limit

    # Insérer les appels dans la base
    calls_synced = 0
    for call in all_calls:
        user = call.get('user') or {}
        contact = call.get('contact')
        voicemail = call.get('voicemail')
        record = call.get('record')

        # Gérer les URLs (peuvent être string directe ou dict avec 'url')
        voicemail_url = None
        if voicemail:
            voicemail_url = voicemail if isinstance(voicemail, str) else voicemail.get('url')

        record_url = None
        if record:
            record_url = record if isinstance(record, str) else record.get('url')

        try:
            cursor.execute('''
                INSERT OR REPLACE INTO calls
                (cdr_id, call_id, direction, is_answered, last_state, start_time, end_time,
                total_duration, incall_duration, from_number, to_number, contact_number,
                hangup_by, voicemail_url, record_url, user_name, user_email, contact_name,
                notes, tags, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                call.get('cdr_id'),
                call.get('call_id'),
                call.get('direction'),
                call.get('is_answered'),
                call.get('last_state'),
                call.get('start_time'),
                call.get('end_time'),
                call.get('total_duration'),
                call.get('incall_duration'),
                call.get('from_number'),
                call.get('to_number'),
                call.get('contact_number'),
                call.get('hangup_by'),
                voicemail_url,
                record_url,
                user.get('concat_name'),
                user.get('email'),
                contact.get('concat_name') if isinstance(contact, dict) else None,
                call.get('note'),
                ','.join(call.get('tags') or []) if call.get('tags') else None,
                datetime.now().isoformat()
            ))
            calls_synced += 1
        except Exception as e:
            print(f"Erreur insertion appel: {e}")

    # Récupérer les contacts
    contacts_data = ringover_request('contacts', {'limit_count': 1000})
    contacts_synced = 0

    if contacts_data and contacts_data.get('contact_list'):
        for contact in contacts_data['contact_list']:
            numbers = contact.get('numbers') or []
            phone = numbers[0] if numbers else {}

            try:
                cursor.execute('''
                    INSERT OR REPLACE INTO contacts
                    (contact_id, firstname, lastname, company, phone_number, phone_type,
                    email, creation_date, synced_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    contact.get('contact_id'),
                    contact.get('firstname'),
                    contact.get('lastname'),
                    contact.get('company'),
                    str(phone.get('number', '')) if phone else None,
                    phone.get('type') if phone else None,
                    None,
                    contact.get('creation_date'),
                    datetime.now().isoformat()
                ))
                contacts_synced += 1
            except Exception as e:
                print(f"Erreur insertion contact: {e}")

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'calls_synced': calls_synced,
        'contacts_synced': contacts_synced,
        'total_calls_from_api': len(all_calls)
    })

@app.route('/api/calls')
def get_calls():
    """Récupère les appels depuis la base locale"""
    conn = get_db()
    cursor = conn.cursor()

    # Filtres optionnels
    direction = request.args.get('direction')
    state = request.args.get('state')
    search = request.args.get('search')

    query = "SELECT * FROM calls WHERE 1=1"
    params = []

    if direction:
        query += " AND direction = ?"
        params.append(direction)

    if state:
        query += " AND last_state = ?"
        params.append(state)

    if search:
        query += " AND (from_number LIKE ? OR to_number LIKE ? OR contact_name LIKE ?)"
        params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])

    query += " ORDER BY start_time DESC"

    cursor.execute(query, params)
    calls = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(calls)

@app.route('/api/contacts')
def get_contacts():
    """Récupère les contacts depuis la base locale"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM contacts ORDER BY firstname, lastname")
    contacts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(contacts)

@app.route('/api/stats')
def get_stats():
    """Statistiques des appels"""
    conn = get_db()
    cursor = conn.cursor()

    stats = {}

    # Total appels
    cursor.execute("SELECT COUNT(*) as total FROM calls")
    stats['total_calls'] = cursor.fetchone()['total']

    # Appels entrants/sortants
    cursor.execute("SELECT direction, COUNT(*) as count FROM calls GROUP BY direction")
    for row in cursor.fetchall():
        stats[f'{row["direction"]}_calls'] = row['count']

    # Appels par état
    cursor.execute("SELECT last_state, COUNT(*) as count FROM calls GROUP BY last_state")
    stats['by_state'] = {row['last_state']: row['count'] for row in cursor.fetchall()}

    # Durée moyenne
    cursor.execute("SELECT AVG(incall_duration) as avg_duration FROM calls WHERE is_answered = 1")
    avg = cursor.fetchone()['avg_duration']
    stats['avg_duration'] = round(avg, 1) if avg else 0

    # Numéros les plus fréquents
    cursor.execute('''
        SELECT contact_number, COUNT(*) as count
        FROM calls
        GROUP BY contact_number
        ORDER BY count DESC
        LIMIT 10
    ''')
    stats['top_numbers'] = [{'number': row['contact_number'], 'count': row['count']}
                           for row in cursor.fetchall()]

    # Total contacts
    cursor.execute("SELECT COUNT(*) as total FROM contacts")
    stats['total_contacts'] = cursor.fetchone()['total']

    conn.close()
    return jsonify(stats)

@app.route('/api/call/<int:cdr_id>/notes', methods=['GET', 'POST'])
def call_notes(cdr_id):
    """Gestion des notes pour un appel"""
    conn = get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.json
        cursor.execute('''
            INSERT INTO crm_notes (call_cdr_id, contact_number, note, created_at)
            VALUES (?, ?, ?, ?)
        ''', (cdr_id, data.get('contact_number'), data.get('note'), datetime.now().isoformat()))
        conn.commit()
        conn.close()
        return jsonify({'success': True})

    cursor.execute("SELECT * FROM crm_notes WHERE call_cdr_id = ? ORDER BY created_at DESC", (cdr_id,))
    notes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(notes)

@app.route('/api/number/<number>/history')
def number_history(number):
    """Historique des appels pour un numéro"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM calls
        WHERE contact_number LIKE ? OR from_number LIKE ? OR to_number LIKE ?
        ORDER BY start_time DESC
    ''', (f'%{number}%', f'%{number}%', f'%{number}%'))

    calls = [dict(row) for row in cursor.fetchall()]

    # Notes associées
    cursor.execute("SELECT * FROM crm_notes WHERE contact_number LIKE ?", (f'%{number}%',))
    notes = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify({'calls': calls, 'notes': notes})

@app.route('/api/live')
def live_data():
    """Données en temps réel depuis Ringover"""
    # Présence
    presence = ringover_request('presences')

    # Derniers appels (direct API)
    calls = ringover_request('calls', {'limit_count': 5})

    return jsonify({
        'presence': presence,
        'recent_calls': calls.get('call_list', []) if calls else []
    })

@app.route('/api/export')
def export_data():
    """Exporte les données en CSV"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM calls ORDER BY start_time DESC")
    calls = cursor.fetchall()
    conn.close()

    # Générer CSV
    import csv
    from io import StringIO

    output = StringIO()
    writer = csv.writer(output)

    # En-têtes
    writer.writerow(['Date', 'Direction', 'De', 'Vers', 'État', 'Durée (s)', 'Agent', 'Enregistrement'])

    for call in calls:
        writer.writerow([
            call['start_time'],
            call['direction'],
            call['from_number'],
            call['to_number'],
            call['last_state'],
            call['incall_duration'],
            call['user_name'],
            call['record_url'] or ''
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=appels_ringover.csv'}
    )

if __name__ == '__main__':
    init_db()
    print("\n" + "="*50)
    print("   RINGOVER CRM - Application locale")
    print("="*50)
    print("\n   Ouvrez http://localhost:5001 dans votre navigateur\n")
    app.run(debug=True, port=5001, host='127.0.0.1')
